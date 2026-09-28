/**
 * SubjectHistoryModal.tsx — ZenTrack Mobile
 *
 * Authentic Apple iOS-Grade Attendance History Modal.
 * Features clean Inter typography (no serif fonts), unified segmented filter bar,
 * 16px squircle log cards with subtle frosted borders, and tactile undo actions.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  SectionList,
  Pressable,
  StyleSheet,
  Platform,
  Dimensions,
  BackHandler,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import Reanimated, {
  SlideOutRight,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { formatAttendanceHistoryDate } from '../../screens/attendance/attendanceConstants';
import { FONT_FAMILY, SHADOW } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import type { AttendanceSubject } from '../../contexts/MobileDataContext';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ── Hoisted Styles (Prevents TDZ ReferenceError in Hermes Engine) ─────────────
const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },

  // ── Header Bar ────────────────────────────────────────────────────────────
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Stats Overview Card ───────────────────────────────────────────────────
  historyStatsCard: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    ...SHADOW.sm,
  },
  statsMainText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  statsTargetText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
  },
  splitText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11.5,
  },
  pctBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pctBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    letterSpacing: -0.2,
  },

  // ── Segmented Control ─────────────────────────────────────────────────────
  segmentedTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 3,
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentBtnActive: {
    ...SHADOW.sm,
  },
  segmentBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    letterSpacing: -0.1,
  },

  // ── List & History Cards ──────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 6,
  },
  sectionHeaderTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    ...SHADOW.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  historyStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7.5,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
  },
  historyStatusText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11.5,
  },
  historyTypePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  historyTypeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    letterSpacing: 0.5,
  },
  historyExtraPill: {
    paddingHorizontal: 5,
    paddingVertical: 2.5,
    borderRadius: 5,
    borderWidth: 1,
  },
  historyExtraText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    color: '#F59E0B',
    letterSpacing: 0.5,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  historyDayBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  historyDayBadgeToday: {
    // configured dynamically
  },
  historyDayBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
  },
  historyDateText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
  },
  historyTimeText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 11.5,
  },
  historyUndoBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Empty State ───────────────────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 17,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
});

// ── Apple iOS Tactile Undo Button with Lightweight Pressable ─────────────────
const SpringUndoButton = React.memo(function SpringUndoButton({
  onPress,
  style,
  colors,
}: {
  onPress: () => void;
  style?: any;
  colors: any;
}) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        style,
        pressed && { opacity: 0.55, transform: [{ scale: 0.9 }] },
      ]}
    >
      <Ionicons name="refresh" size={15} color={colors?.textSecondary || '#8E8E93'} />
    </Pressable>
  );
});

// ── Apple iOS Segmented Control Pill ─────────────────────────────────────────
const SegmentedTabItem = React.memo(function SegmentedTabItem({
  active,
  onPress,
  label,
  iconName,
  isDark,
  colors,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  isDark: boolean;
  colors: any;
}) {
  const handlePress = useCallback(() => {
    Haptics.selectionAsync();
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        { flex: 1 },
        pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] },
      ]}
    >
      <View
        style={[
          styles.segmentBtn,
          active && [
            styles.segmentBtnActive,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.08)',
            },
          ],
        ]}
      >
        {iconName && (
          <Ionicons
            name={iconName}
            size={12}
            color={active ? colors?.textPrimary : (colors?.textSecondary || '#8E8E93')}
            style={{ marginRight: 4 }}
          />
        )}
        <Text
          style={[
            styles.segmentBtnText,
            { color: active ? colors?.textPrimary : (colors?.textSecondary || '#8E8E93') },
            active && { fontFamily: FONT_FAMILY.bold },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
});

// ── Apple iOS-Grade Circular Close Button ────────────────────────────────────
const CircularCloseBtn = React.memo(function CircularCloseBtn({
  onPress,
  isDark,
  colors,
}: {
  onPress: () => void;
  isDark: boolean;
  colors: any;
}) {
  const handlePress = useCallback(() => {
    Haptics.selectionAsync();
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        styles.closeBtn,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)',
        },
        pressed && { opacity: 0.6, transform: [{ scale: 0.9 }] },
      ]}
    >
      <Ionicons name="close" size={18} color={colors?.textPrimary || (isDark ? '#FFFFFF' : '#000000')} />
    </Pressable>
  );
});

// ── Pure Memoized History Log Row with Apple iOS Precision ──────────────────
interface HistoryRowProps {
  log: any;
  colors: any;
  isDark: boolean;
  onUndo: (logId: string) => void;
}

export const AttendanceHistoryRow = React.memo(
  function AttendanceHistoryRow({
    log,
    colors,
    isDark,
    onUndo,
  }: HistoryRowProps) {
    if (!log) return null;

    const isAttended = log.action === 'attended';
    const isMissed = log.action === 'missed';
    const isLab = log.type === 'lab';
    const isExtra = !!log.isExtra;

    const dateInfo = formatAttendanceHistoryDate(log.date, log.timestamp);

    const statusColor = isAttended
      ? '#30D158'
      : isMissed
      ? '#FF453A'
      : '#FF9F0A';

    const statusBg = isAttended
      ? isDark
        ? 'rgba(48, 209, 88, 0.12)'
        : 'rgba(48, 209, 88, 0.10)'
      : isMissed
      ? isDark
        ? 'rgba(255, 69, 58, 0.12)'
        : 'rgba(255, 69, 58, 0.10)'
      : isDark
      ? 'rgba(255, 159, 10, 0.12)'
      : 'rgba(255, 159, 10, 0.10)';

    const statusBorder = isAttended
      ? isDark
        ? 'rgba(48, 209, 88, 0.28)'
        : 'rgba(48, 209, 88, 0.22)'
      : isMissed
      ? isDark
        ? 'rgba(255, 69, 58, 0.28)'
        : 'rgba(255, 69, 58, 0.22)'
      : isDark
      ? 'rgba(255, 159, 10, 0.28)'
      : 'rgba(255, 159, 10, 0.22)';

    const iconName = isAttended
      ? 'checkmark-circle'
      : isMissed
      ? 'close-circle'
      : 'ban';

    const actionText = isAttended
      ? 'Attended'
      : isMissed
      ? 'Missed'
      : 'Cancelled';

    const handleUndoPress = useCallback(() => {
      if (log?.id) onUndo(String(log.id));
    }, [log?.id, onUndo]);

    return (
      <View
        style={[
          styles.historyCard,
          {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderColor: isDark ? '#1c1c20' : 'rgba(0, 0, 0, 0.06)',
          },
        ]}
      >
        <View style={{ flex: 1, marginRight: 12 }}>
          {/* Top: Status Badge + Type Badges */}
          <View style={styles.badgeRow}>
            <View style={[styles.historyStatusPill, { backgroundColor: statusBg, borderColor: statusBorder }]}>
              <Ionicons name={iconName} size={12} color={statusColor} style={{ marginRight: 3.5 }} />
              <Text style={[styles.historyStatusText, { color: statusColor }]}>{actionText}</Text>
            </View>

            {/* Class / Lab Badge */}
            <View
              style={[
                styles.historyTypePill,
                isLab
                  ? {
                      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.08)',
                      borderColor: isDark ? 'rgba(56, 189, 248, 0.26)' : 'rgba(2, 132, 199, 0.20)',
                    }
                  : {
                      backgroundColor: isDark ? 'rgba(165, 153, 255, 0.12)' : 'rgba(124, 58, 237, 0.08)',
                      borderColor: isDark ? 'rgba(165, 153, 255, 0.26)' : 'rgba(124, 58, 237, 0.20)',
                    },
              ]}
            >
              <Text
                style={[
                  styles.historyTypeText,
                  { color: isLab ? '#38BDF8' : (colors?.accentPrimary || '#A599FF') },
                ]}
              >
                {isLab ? 'LAB' : 'CLASS'}
              </Text>
            </View>

            {/* Extra Badge if extra */}
            {isExtra && (
              <View
                style={[
                  styles.historyExtraPill,
                  {
                    backgroundColor: isDark ? 'rgba(251, 191, 36, 0.12)' : 'rgba(217, 119, 6, 0.08)',
                    borderColor: isDark ? 'rgba(251, 191, 36, 0.26)' : 'rgba(217, 119, 6, 0.20)',
                  },
                ]}
              >
                <Text style={styles.historyExtraText}>EXTRA</Text>
              </View>
            )}
          </View>

          {/* Bottom: Date with Today/Yesterday badge and Time */}
          <View style={styles.dateRow}>
            {dateInfo.dayLabel ? (
              <View
                style={[
                  styles.historyDayBadge,
                  dateInfo.isToday && [
                    styles.historyDayBadgeToday,
                    {
                      backgroundColor: isDark ? 'rgba(165, 153, 255, 0.2)' : 'rgba(124, 58, 237, 0.12)',
                    },
                  ],
                ]}
              >
                <Text
                  style={[
                    styles.historyDayBadgeText,
                    {
                      color: dateInfo.isToday
                        ? (colors?.accentPrimary || '#A599FF')
                        : (colors?.textSecondary || '#8E8E93'),
                    },
                  ]}
                >
                  {dateInfo.dayLabel}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.historyDateText, { color: colors?.textPrimary }]}>
              {dateInfo.fullDateStr}
            </Text>

            {dateInfo.timeStr ? (
              <Text style={[styles.historyTimeText, { color: colors?.textSecondary || colors?.textMuted || '#8E8E93' }]}>
                • {dateInfo.timeStr}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Undo Button with smooth tactile feedback */}
        <SpringUndoButton
          onPress={handleUndoPress}
          style={[
            styles.historyUndoBtn,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            },
          ]}
          colors={colors}
        />
      </View>
    );
  },
  (prev, next) => {
    if (!prev?.log || !next?.log) return false;
    return (
      prev.log.id === next.log.id &&
      prev.log.action === next.log.action &&
      prev.log.date === next.log.date &&
      prev.log.timestamp === next.log.timestamp &&
      prev.isDark === next.isDark &&
      prev.colors === next.colors &&
      prev.onUndo === next.onUndo
    );
  }
);

// ── Dedicated Memoized Subject History Modal ─────────────────────────────────
export interface SubjectHistoryModalProps {
  visible: boolean;
  subject: AttendanceSubject | null;
  logs: any[];
  subjects: AttendanceSubject[];
  colors?: any;
  isDark?: boolean;
  styles?: any;
  onClose: () => void;
  onUndo: (logId: string) => void;
}

export const SubjectHistoryModal = React.memo(function SubjectHistoryModal({
  visible,
  subject,
  logs,
  subjects,
  colors: propColors,
  isDark: propIsDark,
  onClose,
  onUndo,
}: SubjectHistoryModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const colors = propColors || theme.colors;
  const isDark = typeof propIsDark === 'boolean' ? propIsDark : theme.isDark;

  // Retain last non-null subject during slide-down animation so it never renders blank
  const lastSubjectRef = React.useRef<AttendanceSubject | null>(subject);
  if (subject) {
    lastSubjectRef.current = subject;
  }
  const currentSubject = subject || lastSubjectRef.current;

  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const isClosingRef = React.useRef(false);

  const handleRequestClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Keyboard.dismiss();
    backdropOpacity.value = withTiming(0, {
      duration: 220,
      easing: Easing.linear,
    });
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      {
        duration: 260,
        easing: Easing.bezier(0.32, 0, 0.67, 0),
      },
      (finished) => {
        if (finished) {
          runOnJS(setMounted)(false);
          runOnJS(onClose)();
          isClosingRef.current = false;
        }
      }
    );
  }, [backdropOpacity, translateY, onClose]);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setMounted(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      translateY.value = SCREEN_HEIGHT;
      translateY.value = withTiming(0, {
        duration: 320,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      });
      backdropOpacity.value = withTiming(1, {
        duration: 260,
        easing: Easing.out(Easing.quad),
      });
    } else if (mounted) {
      handleRequestClose();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleRequestClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, handleRequestClose]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const [historyFilterType, setHistoryFilterType] = useState<'all' | 'class' | 'lab'>('all');

  useEffect(() => {
    setHistoryFilterType('all');
  }, [currentSubject?.id]);

  const sortedHistoryLogs = useMemo(() => {
    if (!currentSubject) return [];
    const safeLogs = Array.isArray(logs) ? logs : [];
    const filtered = safeLogs.filter((l) => {
      if (!l) return false;
      const matchId = currentSubject.id && l.subjectId === currentSubject.id;
      const matchName =
        currentSubject.name &&
        (l.subjectName === currentSubject.name || l.subjectId === currentSubject.name);
      return matchId || matchName;
    });

    const sorted = [...filtered].sort((a, b) => {
      const dateA = String(a?.date || '');
      const dateB = String(b?.date || '');
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      const timeA = typeof a?.timestamp === 'number' ? a.timestamp : 0;
      const timeB = typeof b?.timestamp === 'number' ? b.timestamp : 0;
      return timeB - timeA;
    });

    const seen = new Set<string>();
    const deduplicated: typeof sorted = [];

    for (let i = 0; i < sorted.length; i++) {
      const l = sorted[i];
      if (!l) continue;
      if (l.isExtra) {
        deduplicated.push(l);
      } else {
        const dateStr = String(l.date || '').slice(0, 10);
        const slotKey = `${dateStr}_${l.type === 'lab' ? 'lab' : 'class'}_${l.idx ?? 0}`;
        if (!seen.has(slotKey)) {
          seen.add(slotKey);
          deduplicated.push(l);
        }
      }
    }

    return deduplicated;
  }, [currentSubject, logs]);

  const classHistoryLogs = useMemo(
    () => sortedHistoryLogs.filter((l) => l.type !== 'lab'),
    [sortedHistoryLogs]
  );
  const labHistoryLogs = useMemo(
    () => sortedHistoryLogs.filter((l) => l.type === 'lab'),
    [sortedHistoryLogs]
  );

  const historySections = useMemo(() => {
    if (historyFilterType === 'class') {
      return [{ title: 'Classes', type: 'class' as const, count: classHistoryLogs.length, data: classHistoryLogs }];
    }
    if (historyFilterType === 'lab') {
      return [{ title: 'Labs', type: 'lab' as const, count: labHistoryLogs.length, data: labHistoryLogs }];
    }
    const list: { title: string; type: 'class' | 'lab'; count: number; data: typeof sortedHistoryLogs }[] = [];
    if (classHistoryLogs.length > 0) {
      list.push({ title: 'Classes', type: 'class', count: classHistoryLogs.length, data: classHistoryLogs });
    }
    if (labHistoryLogs.length > 0) {
      list.push({ title: 'Labs', type: 'lab', count: labHistoryLogs.length, data: labHistoryLogs });
    }
    return list;
  }, [historyFilterType, classHistoryLogs, labHistoryLogs, sortedHistoryLogs]);

  const sub = useMemo(() => {
    if (!currentSubject) return null;
    const safeSubjects = Array.isArray(subjects) ? subjects : [];
    return (
      safeSubjects.find(
        (s) =>
          (s && currentSubject.id && s.id === currentSubject.id) ||
          (s && s.name === currentSubject.name)
      ) || currentSubject
    );
  }, [subjects, currentSubject]);

  const att = (sub?.classesAttended || 0) + (sub?.labsAttended || 0);
  const tot = (sub?.classesTotal || 0) + (sub?.labsTotal || 0);
  const pct = tot > 0 ? (att / tot) * 100 : 100;
  const target = sub?.targetPercentage || 75;
  const isSafe = pct >= target;

  const statusColor = isSafe
    ? '#30D158'
    : pct >= target - 5
    ? '#FF9F0A'
    : '#FF453A';

  const renderItem = useCallback(
    ({ item: l }: { item: any }) => (
      <AttendanceHistoryRow
        log={l}
        colors={colors}
        isDark={isDark}
        onUndo={onUndo}
      />
    ),
    [colors, isDark, onUndo]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: any }) => {
      if (classHistoryLogs.length === 0 || labHistoryLogs.length === 0) return null;
      const isLab = section.type === 'lab';
      return (
        <View style={[styles.sectionHeader, isLab && { marginTop: 14 }]}>
          <Ionicons
            name={isLab ? 'flask' : 'book'}
            size={12}
            color={isLab ? '#38BDF8' : (colors?.accentPrimary || '#A599FF')}
          />
          <Text
            style={[
              styles.sectionHeaderTitle,
              { color: isLab ? '#38BDF8' : (colors?.accentPrimary || '#A599FF') },
            ]}
          >
            {section.title.toUpperCase()} ({section.count})
          </Text>
        </View>
      );
    },
    [classHistoryLogs.length, labHistoryLogs.length, colors]
  );

  if (!visible && !mounted) return null;
  if (!currentSubject) return null;

  return (
    <Modal
      visible={mounted}
      animationType="none"
      transparent
      onRequestClose={handleRequestClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1 }}>
        <Reanimated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.35)' },
            backdropAnimatedStyle,
          ]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={25} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.45)' }]} />
          )}
          <Pressable style={StyleSheet.absoluteFill} onPress={handleRequestClose} />
        </Reanimated.View>

        <Reanimated.View
          style={[{ flex: 1, backgroundColor: isDark ? '#000000' : (colors?.background || '#F8F9FA') }, sheetAnimatedStyle]}
        >
          <SafeAreaView
            style={[styles.modalRoot, { backgroundColor: isDark ? '#000000' : (colors?.background || '#F8F9FA') }]}
            edges={['top']}
          >
            {/* Apple iOS Navigation Header */}
            <View
              style={[
                styles.modalHeader,
                {
                  borderBottomColor: isDark
                    ? '#1c1c20'
                    : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.modalTitle, { color: colors?.textPrimary }]} numberOfLines={1}>
                  {currentSubject.name}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors?.textSecondary || colors?.textMuted }]}>
                  Attendance History • {sortedHistoryLogs.length} {sortedHistoryLogs.length === 1 ? 'entry' : 'entries'}
                </Text>
              </View>
              <CircularCloseBtn
                onPress={handleRequestClose}
                isDark={isDark}
                colors={colors}
              />
            </View>

            {/* Refined Apple 18px Squircle Overview Strip */}
            <View
              style={[
                styles.historyStatsCard,
                {
                  backgroundColor: isDark ? '#000000' : '#FFFFFF',
                  borderColor: isDark ? '#1c1c20' : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.statsMainText, { color: colors?.textPrimary }]}>
                      {att} of {tot} attended
                    </Text>
                    <Text style={[styles.statsTargetText, { color: colors?.textSecondary || colors?.textMuted }]}>
                      • Target: {target}%
                    </Text>
                  </View>

                  {/* Class vs Lab split */}
                  {(((sub?.labsTotal || 0) > 0) || ((sub?.classesTotal || 0) > 0)) && (
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                      {(sub?.classesTotal || 0) > 0 && (
                        <Text style={[styles.splitText, { color: colors?.textSecondary || colors?.textMuted }]}>
                          Class:{' '}
                          <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors?.textPrimary }}>
                            {sub?.classesAttended || 0}/{sub?.classesTotal || 0}
                          </Text>
                        </Text>
                      )}
                      {(sub?.labsTotal || 0) > 0 && (
                        <Text style={[styles.splitText, { color: colors?.textSecondary || colors?.textMuted }]}>
                          Lab:{' '}
                          <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors?.textPrimary }}>
                            {sub?.labsAttended || 0}/{sub?.labsTotal || 0}
                          </Text>
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                {/* Health Percentage Badge */}
                <View
                  style={[
                    styles.pctBadge,
                    {
                      backgroundColor: statusColor + '18',
                      borderColor: statusColor + '35',
                    },
                  ]}
                >
                  <Text style={[styles.pctBadgeText, { color: statusColor }]}>
                    {tot > 0 ? `${Math.round(pct)}%` : '--%'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Apple iOS Unified Segmented Control */}
            {classHistoryLogs.length > 0 && labHistoryLogs.length > 0 && (
              <View
                style={[
                  styles.segmentedTrack,
                  {
                    backgroundColor: isDark ? '#0d0d10' : '#E5E5EA',
                    borderColor: isDark ? '#1c1c20' : 'rgba(0, 0, 0, 0.04)',
                  },
                ]}
              >
                <SegmentedTabItem
                  active={historyFilterType === 'all'}
                  onPress={() => setHistoryFilterType('all')}
                  label={`All (${sortedHistoryLogs.length})`}
                  isDark={isDark}
                  colors={colors}
                />
                <SegmentedTabItem
                  active={historyFilterType === 'class'}
                  onPress={() => setHistoryFilterType('class')}
                  label={`Classes (${classHistoryLogs.length})`}
                  iconName="book-outline"
                  isDark={isDark}
                  colors={colors}
                />
                <SegmentedTabItem
                  active={historyFilterType === 'lab'}
                  onPress={() => setHistoryFilterType('lab')}
                  label={`Labs (${labHistoryLogs.length})`}
                  iconName="flask-outline"
                  isDark={isDark}
                  colors={colors}
                />
              </View>
            )}

            {/* Log List with Apple Grouped Sections */}
            <SectionList
              sections={historySections}
              keyExtractor={(l, index) =>
                l?.id
                  ? String(l.id)
                  : `${String(l?.date || '')}_${l?.timestamp || 0}_${l?.action || ''}_${l?.type || ''}_${index}`
              }
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: Math.max(insets.bottom, 20) + 40 },
              ]}
              showsVerticalScrollIndicator={false}
              stickySectionHeadersEnabled={false}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              renderSectionHeader={renderSectionHeader}
              renderItem={renderItem}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <View
                    style={[
                      styles.emptyIconCircle,
                      {
                        backgroundColor: isDark ? 'rgba(165, 153, 255, 0.10)' : 'rgba(108, 92, 231, 0.08)',
                        borderColor: isDark ? 'rgba(165, 153, 255, 0.20)' : 'rgba(108, 92, 231, 0.16)',
                      },
                    ]}
                  >
                    <Ionicons name="calendar-outline" size={32} color={colors?.accentPrimary || '#A599FF'} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors?.textPrimary }]}>
                    No Logs Found
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: colors?.textSecondary || colors?.textMuted }]}>
                    {historyFilterType === 'class'
                      ? 'No class attendance logs recorded for this subject.'
                      : historyFilterType === 'lab'
                      ? 'No lab attendance logs recorded for this subject.'
                      : 'Classes and labs you mark will appear here chronologically from newest to oldest.'}
                  </Text>
                </View>
              }
            />
          </SafeAreaView>
        </Reanimated.View>
      </View>
    </Modal>
  );
});

export default SubjectHistoryModal;
