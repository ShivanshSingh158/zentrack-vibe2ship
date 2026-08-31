import React, { useRef, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ScrollView,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Animated
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AddSubjectModal } from '../components/Academic/AddSubjectModal';
import { TimetableModal } from '../components/Academic/TimetableModal';
import ClassNotifSettingsModal from '../components/Academic/ClassNotifSettingsModal';
import SaraHUDBanner from '../components/SARA/SaraHUDBanner';
import { useTheme } from "../contexts/ThemeContext";
import { useSaraSurface } from '../hooks/useSaraSurface';
import { useAcademicData } from '../contexts/domains/AcademicContext';

// --- NEW ATTENDANCE MODULE IMPORTS ---
import { 
  SCHEMA_VERSION, defaultSchedule, DAY_NAMES, DAY_SHORT, 
  getLocalDateString, formatDisplayDate, formatAttendanceHistoryDate, getWeekDates, 
  calculateStatus, getProgressColor, parseTimeToMinutes 
} from './attendance/attendanceConstants';
import { calculateBunkMath } from '../utils/academicMath';
import { FONT_FAMILY, SPACE, RADIUS, SHADOW, FONT_SIZE } from '../theme/tokens';
import { makeStyles } from './attendance/attendanceStyles';
import { useAttendanceData } from './attendance/useAttendanceData';
import { useAttendanceFirestore } from './attendance/useAttendanceFirestore';
import { HorizontalWeekStrip } from './attendance/HorizontalWeekStrip';
import ErrorBoundary from '../components/ErrorBoundary';
import EmptyState from '../components/ui/EmptyState';
import { setTabBarVisible } from '../utils/tabBarScroll';
import BottomSheet from '../components/ui/BottomSheet';
import type { AttendanceSubject } from '../contexts/MobileDataContext';
import AttendanceSkeleton from '../components/Academic/AttendanceSkeleton';

// ── Pure Memoized Session Action Row ─────────────────────────────────────────
interface SessionRowProps {
  session: any;
  log: any;
  colors: any;
  isDark: boolean;
  styles: any;
  onUndo: (logId: string) => void;
  onLog: (subject: any, type: 'class' | 'lab', action: 'attended' | 'missed' | 'cancelled', existingLogId: string | undefined, sessionIdx: number) => void;
}

const AttendanceSessionRow = React.memo(function AttendanceSessionRow({
  session,
  log,
  colors,
  isDark,
  styles,
  onUndo,
  onLog,
}: SessionRowProps) {
  const { subject, type } = session;
  const isLab = type === 'lab';

  // 0ms instant optimistic local state
  const [localAction, setLocalAction] = React.useState<'attended' | 'missed' | 'cancelled' | null>(
    log?.action ?? null
  );

  React.useEffect(() => {
    setLocalAction(log?.action ?? null);
  }, [log?.action, log?.id]);

  const isPresent = localAction === 'attended';
  const isAbsent = localAction === 'missed';
  const isCancelled = localAction === 'cancelled';

  const { idx: sessionIdx } = session;

  const handlePressPresent = useCallback(() => {
    if (isPresent) {
      setLocalAction(null);
      setTimeout(() => {
        if (log?.id) onUndo(log.id);
      }, 0);
    } else {
      setLocalAction('attended');
      setTimeout(() => {
        onLog(subject, type, 'attended', log?.id, sessionIdx);
      }, 0);
    }
  }, [isPresent, log?.id, onUndo, onLog, subject, type, sessionIdx]);

  const handlePressAbsent = useCallback(() => {
    if (isAbsent) {
      setLocalAction(null);
      setTimeout(() => {
        if (log?.id) onUndo(log.id);
      }, 0);
    } else {
      setLocalAction('missed');
      setTimeout(() => {
        onLog(subject, type, 'missed', log?.id, sessionIdx);
      }, 0);
    }
  }, [isAbsent, log?.id, onUndo, onLog, subject, type, sessionIdx]);

  const handlePressCancelled = useCallback(() => {
    if (isCancelled) {
      setLocalAction(null);
      setTimeout(() => {
        if (log?.id) onUndo(log.id);
      }, 0);
    } else {
      setLocalAction('cancelled');
      setTimeout(() => {
        onLog(subject, type, 'cancelled', log?.id, sessionIdx);
      }, 0);
    }
  }, [isCancelled, log?.id, onUndo, onLog, subject, type, sessionIdx]);

  return (
    <View style={styles.sessionCard}>
      {/* Left: subject name + time + inline class/lab tag */}
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={styles.sessionSubjectName} numberOfLines={1}>
          {subject.name}
        </Text>
        {/* Time + inline badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <Text style={styles.sessionTimeText}>{session.timeStr}</Text>
          <View style={[styles.inlineTypeBadge, isLab ? styles.inlineTypeBadgeLab : styles.inlineTypeBadgeClass]}>
            <Text style={[styles.inlineTypeBadgeText, isLab ? styles.inlineTypeBadgeTextLab : styles.inlineTypeBadgeTextClass]}>
              {isLab ? 'LAB' : 'CLASS'}
            </Text>
          </View>
        </View>
      </View>

      {/* Right: Segmented Present / Absent / Cancelled Toggle */}
      <View style={styles.segmentedToggleContainer}>
        {/* Present segment */}
        <TouchableOpacity
          onPress={handlePressPresent}
          delayPressIn={0}
          style={[
            styles.segmentBtn,
            isPresent && styles.segmentBtnPresentActive,
          ]}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentBtnText, isPresent && styles.segmentBtnPresentTextActive]}>
            Present
          </Text>
        </TouchableOpacity>

        {/* Absent segment */}
        <TouchableOpacity
          onPress={handlePressAbsent}
          delayPressIn={0}
          style={[
            styles.segmentBtn,
            isAbsent && styles.segmentBtnAbsentActive,
          ]}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentBtnText, isAbsent && styles.segmentBtnAbsentTextActive]}>
            Absent
          </Text>
        </TouchableOpacity>

        {/* Cancelled (Cross) segment */}
        <TouchableOpacity
          onPress={handlePressCancelled}
          delayPressIn={0}
          style={[
            styles.segmentIconBtn,
            isCancelled && styles.segmentBtnCancelledActive,
          ]}
          activeOpacity={0.7}
          accessibilityLabel="Mark Class Cancelled"
        >
          <Ionicons
            name="close"
            size={15}
            color={isCancelled ? (isDark ? '#F2F2F7' : '#1C1C1E') : (isDark ? '#8E8E93' : '#6B7280')}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ── Pure Memoized Subject Summary Row (By Subject with Decoupled Plain Labels) ──
interface SubjectSummaryRowProps {
  subject: AttendanceSubject;
  colors: any;
  isDark: boolean;
  styles: any;
  onPress: () => void;
}

const SubjectSummaryRow = React.memo(function SubjectSummaryRow({
  subject,
  colors,
  isDark,
  styles,
  onPress,
}: SubjectSummaryRowProps) {
  const getThemeProgressColor = (urgency: string) =>
    urgency === 'danger' ? colors.priorityHigh : urgency === 'warning' ? colors.priorityMed : colors.priorityLow;

  const hasLabs = (subject.labsTotal || 0) > 0 || (subject.labsAttended || 0) > 0;
  const hasClasses = (subject.classesTotal || 0) > 0 || (subject.classesAttended || 0) > 0;

  const classStatus = calculateStatus(
    subject.classesAttended || 0,
    subject.classesTotal || 0,
    subject.targetPercentage
  );
  const labStatus = calculateStatus(
    subject.labsAttended || 0,
    subject.labsTotal || 0,
    subject.targetPercentage
  );
  const totalAtt = (subject.classesAttended || 0) + (subject.labsAttended || 0);
  const totalCls = (subject.classesTotal || 0) + (subject.labsTotal || 0);
  const combinedStatus = calculateStatus(totalAtt, totalCls, subject.targetPercentage);
  const pColor = getThemeProgressColor(combinedStatus.urgency);

  const bunk = calculateBunkMath(
    totalAtt,
    totalCls,
    subject.targetPercentage || 75
  );

  return (
    <TouchableOpacity onPress={onPress} style={styles.bySubjectCard} activeOpacity={0.8}>
      {/* Top row: Subject name and overall percentage */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={styles.bySubjectName} numberOfLines={1}>{subject.name}</Text>
        <Text style={[styles.bySubjectPct, { color: pColor }]}>
          {combinedStatus.pct !== null ? `${Math.round(combinedStatus.pct)}%` : '--%'}
        </Text>
      </View>

      {/* Decoupled Progress Bars */}
      <View style={{ gap: 8 }}>
        {hasClasses && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={styles.plainTrackLabel}>Class</Text>
            <View style={styles.plainProgressBarBg}>
              <View
                style={[
                  styles.plainProgressBarFill,
                  {
                    width: `${Math.min(100, classStatus.pct || 0)}%`,
                    backgroundColor: getThemeProgressColor(classStatus.urgency),
                  },
                ]}
              />
            </View>
            <Text style={styles.plainTrackCount}>
              {subject.classesAttended || 0}/{subject.classesTotal || 0}
            </Text>
          </View>
        )}

        {hasLabs && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={styles.plainTrackLabel}>Lab</Text>
            <View style={styles.plainProgressBarBg}>
              <View
                style={[
                  styles.plainProgressBarFill,
                  {
                    width: `${Math.min(100, labStatus.pct || 0)}%`,
                    backgroundColor: getThemeProgressColor(labStatus.urgency),
                  },
                ]}
              />
            </View>
            <Text style={styles.plainTrackCount}>
              {subject.labsAttended || 0}/{subject.labsTotal || 0}
            </Text>
          </View>
        )}

        {/* Bottom Status / Bunk Message */}
        {(() => {
          if (bunk.status === 'safe' && bunk.count > 0) {
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Text style={{ color: colors.priorityLow || '#10B981', fontSize: 12, fontWeight: '600' }}>
                  ✓ Can miss {bunk.count} more
                </Text>
              </View>
            );
          }
          if (bunk.status === 'warning') {
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Text style={{ color: colors.priorityMed || '#F59E0B', fontSize: 12, fontWeight: '600' }}>
                  ⚠️ 0 misses left — attend all next classes
                </Text>
              </View>
            );
          }
          if (bunk.status === 'critical') {
            const needed = bunk.count;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Text style={{ color: colors.error || '#EF4444', fontSize: 12, fontWeight: '600' }}>
                  ⚠️ Attend {needed} more {needed === 1 ? 'class' : 'classes'} to reach {subject.targetPercentage || 75}%
                </Text>
              </View>
            );
          }
          return null;
        })()}
      </View>
    </TouchableOpacity>
  );
});

// ── Pure Memoized History Log Row ─────────────────────────────────────────────
interface HistoryRowProps {
  log: any;
  colors: any;
  isDark: boolean;
  styles: any;
  onUndo: (logId: string) => void;
}

const AttendanceHistoryRow = React.memo(function AttendanceHistoryRow({
  log,
  colors,
  isDark,
  styles,
  onUndo,
}: HistoryRowProps) {
  const isAttended = log.action === 'attended';
  const isMissed = log.action === 'missed';
  const isLab = log.type === 'lab';
  const isExtra = !!log.isExtra;

  const dateInfo = formatAttendanceHistoryDate(log.date, log.timestamp);

  const statusColor = isAttended
    ? (isDark ? '#34D399' : '#059669')
    : isMissed
    ? (isDark ? '#F87171' : '#DC2626')
    : (isDark ? '#FBBF24' : '#D97706');

  const statusBg = isAttended
    ? (isDark ? 'rgba(52, 211, 153, 0.12)' : 'rgba(5, 150, 105, 0.10)')
    : isMissed
    ? (isDark ? 'rgba(248, 113, 113, 0.12)' : 'rgba(220, 38, 38, 0.10)')
    : (isDark ? 'rgba(251, 191, 36, 0.12)' : 'rgba(217, 119, 6, 0.10)');

  const statusBorder = isAttended
    ? (isDark ? 'rgba(52, 211, 153, 0.25)' : 'rgba(5, 150, 105, 0.20)')
    : isMissed
    ? (isDark ? 'rgba(248, 113, 113, 0.25)' : 'rgba(220, 38, 38, 0.20)')
    : (isDark ? 'rgba(251, 191, 36, 0.25)' : 'rgba(217, 119, 6, 0.20)');

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

  return (
    <View style={styles.historyCard}>
      <View style={{ flex: 1, marginRight: 12 }}>
        {/* Top: Status Badge + Type Badges */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
          <View style={[styles.historyStatusPill, { backgroundColor: statusBg, borderColor: statusBorder }]}>
            <Ionicons name={iconName} size={13} color={statusColor} style={{ marginRight: 4 }} />
            <Text style={[styles.historyStatusText, { color: statusColor }]}>{actionText}</Text>
          </View>

          {/* Class / Lab Badge */}
          <View style={[styles.historyTypePill, isLab ? styles.historyTypePillLab : styles.historyTypePillClass]}>
            <Text style={[styles.historyTypeText, isLab ? styles.historyTypeTextLab : styles.historyTypeTextClass]}>
              {isLab ? 'LAB' : 'CLASS'}
            </Text>
          </View>

          {/* Extra Badge if extra */}
          {isExtra && (
            <View style={styles.historyExtraPill}>
              <Text style={styles.historyExtraText}>EXTRA</Text>
            </View>
          )}
        </View>

        {/* Bottom: Date with Today/Yesterday badge and Time */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {dateInfo.dayLabel ? (
            <View style={[styles.historyDayBadge, dateInfo.isToday && styles.historyDayBadgeToday]}>
              <Text style={[styles.historyDayBadgeText, dateInfo.isToday && styles.historyDayBadgeTextToday]}>
                {dateInfo.dayLabel}
              </Text>
            </View>
          ) : null}

          <Text style={styles.historyDateText}>
            {dateInfo.fullDateStr}
          </Text>

          {dateInfo.timeStr ? (
            <Text style={styles.historyTimeText}>
              • {dateInfo.timeStr}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Undo Button */}
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (log.id) onUndo(log.id);
        }}
        style={styles.historyUndoBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="refresh" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
});

export default function AttendanceScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();

  // Helper for theme-aware progress colors
  const getThemeProgressColor = (urgency: string) =>
    urgency === 'danger' ? colors.priorityHigh : urgency === 'warning' ? colors.priorityMed : colors.priorityLow;

  // ── Animated pill visibility: 0 at top (flat/normal), 1 on scroll (glass pills) ──
  const pillAnim = useRef(new Animated.Value(0)).current;
  const isPillVisibleRef = useRef(false);
  const lastScrollY = useRef(0);

  const updatePillVisibility = useCallback((offsetY: number) => {
    const shouldShow = offsetY > 20;
    if (shouldShow !== isPillVisibleRef.current) {
      isPillVisibleRef.current = shouldShow;
      Animated.timing(pillAnim, {
        toValue: shouldShow ? 1 : 0,
        duration: shouldShow ? 140 : 80, // Instantly disappears in 80ms on scroll-up
        useNativeDriver: true,
      }).start();
    }

    // Auto-hiding bottom navigation bar on scroll (fast & smooth)
    if (offsetY <= 35) {
      setTabBarVisible(true);
    } else {
      const diff = offsetY - lastScrollY.current;
      if (diff > 10) {
        setTabBarVisible(false); // Scroll down -> hide
      } else if (diff < -6) {
        setTabBarVisible(true); // Scroll up -> show instantly
      }
    }
    lastScrollY.current = offsetY;
  }, [pillAnim]);

  // 1. Core Data & State Hook
  const academic = useAcademicData();
  const { attendanceReady } = academic;
  const data = useAttendanceData();
  const {
    user, subjects, logs, holidays, logsBySubjectId,
    selectedDate, setSelectedDate,
    showDatePicker, setShowDatePicker,
    isTimetableOpen, setIsTimetableOpen,
    showClassNotifModal, setShowClassNotifModal,
    selectedHistorySubject, setSelectedHistorySubject,
    isExtraOpen, setIsExtraOpen,
    showAddModal, setShowAddModal,
    editSubject, setEditSubject,
    extraSubjectId, setExtraSubjectId,
    dismissedWarnings, setDismissedWarnings,
    overrideOpen, setOverrideOpen,
    overrideCounts, setOverrideCounts,
    confirmConfig, setConfirmConfig,
    
    // Derived
    selectedDayOfWeek, isSelectedHoliday, today, weekDates,
    todayScheduledSubjects, warningSubjects, todayFlatSessions,
    globalAttended, globalTotal, globalPct, globalSafe,
  } = data;

  // --- SARA Surface ---
  const surfaceData = React.useMemo(() => ({ subjects, logs }), [subjects, logs]);
  const { surfaceMessage, surfaceActionLabel, dismissBanner } = useSaraSurface("AttendanceScreen", surfaceData as any, user?.uid);

  const firestoreActions = useAttendanceFirestore({
    user, subjects, logs, selectedDate, logsBySubjectId,
    overrideCounts, setOverrideOpen, setConfirmConfig,
    optimisticUpdateAttendance: academic.optimisticUpdateAttendance,
    optimisticAddAttendanceLog: academic.optimisticAddAttendanceLog,
    optimisticUpdateAttendanceLog: academic.optimisticUpdateAttendanceLog,
    optimisticRemoveAttendanceLog: academic.optimisticRemoveAttendanceLog,
    optimisticDeleteSubject: academic.optimisticDeleteSubject,
  });
  const {
    handleLog, handleUndo, handleToggleHoliday, handleDeleteSubject,
    handleApplyOverride, handleResetSemester
  } = firestoreActions;

  // Memoized & strictly sorted history logs (Today -> Oldest, timestamp secondary)
  const sortedHistoryLogs = React.useMemo(() => {
    if (!selectedHistorySubject) return [];
    const filtered = logs.filter(l => l.subjectId === selectedHistorySubject.id);

    return [...filtered].sort((a, b) => {
      // 1. Primary: Sort by ISO date string descending (newest date first, e.g. "2026-08-28" > "2026-08-26" > "2026-07-31")
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      // 2. Secondary: Sort by timestamp descending (newest time first on same date)
      const timeA = typeof a.timestamp === 'number' ? a.timestamp : 0;
      const timeB = typeof b.timestamp === 'number' ? b.timestamp : 0;
      return timeB - timeA;
    });
  }, [selectedHistorySubject, logs]);

  const handleAddSubject = () => {
    setEditSubject(null);
    setShowAddModal(true);
  };

  const renderItem = useCallback(({ item: session }: { item: any }) => {
    const { subject, type, idx } = session;
    const subLogs = (subject.id ? logsBySubjectId[subject.id] : null) || (subject.name ? logsBySubjectId[subject.name] : null) || [];
    const cleanSelDate = (selectedDate || '').slice(0, 10);

    // Fast path: direct idx match (new logs always carry idx)
    let log = subLogs.find(l =>
      (l.date || '').slice(0, 10) === cleanSelDate &&
      !l.isExtra &&
      (type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type)) &&
      l.idx === idx
    ) ?? null;

    // Legacy fallback: positional match for old logs without idx field
    if (!log) {
      let matchIdx = 0;
      for (let i = 0; i < subLogs.length; i++) {
        const l = subLogs[i];
        const isMatchingType = type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type);
        if ((l.date || '').slice(0, 10) === cleanSelDate && !l.isExtra && isMatchingType && l.idx === undefined) {
          if (matchIdx === idx) { log = l; break; }
          matchIdx++;
        }
      }
    }

    return (
      <AttendanceSessionRow
        session={session}
        log={log}
        colors={colors}
        isDark={isDark}
        styles={styles}
        onUndo={handleUndo}
        onLog={handleLog}
      />
    );
  }, [logsBySubjectId, selectedDate, colors, isDark, styles, handleUndo, handleLog]);

  const listHeader = useMemo(() => (
    <>
      {/* ── Semester Overview ── */}
      <View style={{ marginBottom: 0 }}>
        <View style={styles.overviewCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.overviewTitle}>Semester overview</Text>
            <Text style={styles.overviewStats}>{globalAttended}/{globalTotal} classes</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={[styles.overviewPct, { color: globalPct !== null ? (globalPct >= 75 ? colors.priorityLow : (globalPct >= 70 ? colors.priorityMed : colors.error)) : colors.textMuted }]}>
              {globalPct !== null ? `${Math.round(globalPct)}%` : '--%'}
            </Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${Math.min(100, globalPct || 0)}%`, backgroundColor: globalPct !== null ? (globalPct >= 75 ? colors.priorityLow : (globalPct >= 70 ? colors.priorityMed : colors.error)) : colors.border }]} />
            </View>
          </View>
        </View>
      </View>

      {/* ── Warnings ── */}
      {warningSubjects.length > 0 && (
        <View style={styles.warningBanner}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="warning-outline" size={16} color={isDark ? "#f59e0b" : "#D97706"} />
              <Text style={styles.warningTitle}>Low attendance</Text>
            </View>
            <TouchableOpacity onPress={() => setDismissedWarnings(new Set(warningSubjects.map(s => s.id!)))}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={{ marginTop: 6, gap: 4 }}>
            {warningSubjects.map(s => {
              const att = (s.classesAttended || 0) + (s.labsAttended || 0);
              const tot = (s.classesTotal || 0) + (s.labsTotal || 0);
              const pct = tot > 0 ? Math.round((att/tot)*100) : 0;
              const targetPct = s.targetPercentage || 75;
              const need = Math.max(0, Math.ceil((targetPct * tot - 100 * att) / (100 - targetPct)));
              return (
                <Text key={s.id} style={styles.warningText}>
                  {s.name} at {pct}% — attend {need} more to recover
                </Text>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Swipeable Horizontal Week Strip ── */}
      <HorizontalWeekStrip
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        holidays={holidays}
        today={today}
        logs={logs}
      />

      {/* ── Daily Schedule ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, marginTop: 4, marginBottom: 10 }}>
        <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>TODAY'S CLASSES</Text>
        <TouchableOpacity onPress={() => setIsExtraOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 12, color: colors.accentPrimary || '#38BDF8', fontWeight: '600' }}>Extra class +</Text>
        </TouchableOpacity>
      </View>
    </>
  ), [globalAttended, globalTotal, globalPct, warningSubjects, selectedDate, holidays, today, logs, colors, isDark, styles]);

  const listFooter = useMemo(() => {
    if (todayScheduledSubjects.length === 0 || isSelectedHoliday) return null;
    return (
      <View style={{ marginTop: 20, marginBottom: 56 }}>
        <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, paddingHorizontal: 2 }}>BY SUBJECT</Text>
        {todayScheduledSubjects.map(subject => (
          <SubjectSummaryRow
            key={subject.id}
            subject={subject}
            colors={colors}
            isDark={isDark}
            styles={styles}
            onPress={() => setSelectedHistorySubject(subject)}
          />
        ))}
      </View>
    );
  }, [todayScheduledSubjects, isSelectedHoliday, colors, isDark, styles]);

  return (
    <View style={styles.root}>
      <View style={{ flex: 1 }}>
        {/* Cap 5: PSI surface banner for at-risk subjects */}
        <SaraHUDBanner
          message={surfaceMessage || ''}
          visible={!!surfaceMessage}
          onDismiss={dismissBanner}
          actionLabel={surfaceActionLabel || undefined}
        />

        {/* ── Single Sticky Header (Absolute below status bar, 100% Transparent Background, Morphs to Glass Pills on scroll) ── */}
        <View style={[styles.topHeaderWrapper, { top: insets.top }]} pointerEvents="box-none">
          <View style={styles.headerInner}>
            <Text style={styles.headerTitle}>Attendance</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowDatePicker(true); }} style={styles.morphBtn} activeOpacity={0.7}>
                <View style={styles.morphBtnIconWrap}>
                  <Animated.View style={[styles.morphBtnPill, { opacity: pillAnim }]} />
                  <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                </View>
                <Text style={styles.headerBtnText}>Date</Text>
              </TouchableOpacity>

              {/* Holiday Toggle */}
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleToggleHoliday(isSelectedHoliday); }} style={styles.morphBtn} activeOpacity={0.7}>
                <View style={styles.morphBtnIconWrap}>
                  <Animated.View style={[styles.morphBtnPill, isSelectedHoliday && styles.morphBtnPillHoliday, { opacity: pillAnim }]} />
                  <Text style={{ fontSize: 13 }}>🌴</Text>
                </View>
                <Text style={[styles.headerBtnText, isSelectedHoliday && { color: isDark ? '#fbbf24' : '#D97706' }]}>Holiday</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowClassNotifModal(true); }} style={styles.morphBtn} activeOpacity={0.7}>
                <View style={styles.morphBtnIconWrap}>
                  <Animated.View style={[styles.morphBtnPill, styles.morphBtnPillAccent, { opacity: pillAnim }]} />
                  <Ionicons name="notifications-outline" size={16} color={colors.accentPrimary} />
                </View>
                <Text style={[styles.headerBtnText, { color: colors.accentPrimary }]}>Alerts</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setIsTimetableOpen(true); }} style={styles.morphBtn} activeOpacity={0.7}>
                <View style={styles.morphBtnIconWrap}>
                  <Animated.View style={[styles.morphBtnPill, { opacity: pillAnim }]} />
                  <Ionicons name="settings-outline" size={16} color={colors.textMuted} />
                </View>
                <Text style={styles.headerBtnText}>Setup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        
        {showDatePicker && (
          <DateTimePicker
            value={new Date(selectedDate + 'T00:00:00')}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={(e, date) => {
              setShowDatePicker(false);
              if (date) setSelectedDate(getLocalDateString(date));
            }}
          />
        )}

        {/* FIX (Bug D): Skeleton trigger was `!user` which is always false for authenticated users.
            Now uses `!attendanceReady` — true during the window between app launch and first
            Firestore attendance snapshot. Shows skeleton until real data (even empty) arrives. */}
        {!attendanceReady && subjects.length === 0 ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 5, paddingBottom: 120, paddingTop: insets.top + 54 }}
          >
            <AttendanceSkeleton />
          </ScrollView>
        ) : (
          <FlatList
            data={isSelectedHoliday ? [] : todayFlatSessions}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={Platform.OS === 'android'}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            contentContainerStyle={{ paddingHorizontal: 5, paddingBottom: 120, paddingTop: insets.top + 54 }}
            onScroll={(e: any) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              updatePillVisibility(y);
            }}
          onScrollEndDrag={(e: any) => {
            const y = e?.nativeEvent?.contentOffset?.y ?? 0;
            if (y <= 30) {
              setTabBarVisible(true);
            }
            if (y <= 20 && isPillVisibleRef.current) {
              isPillVisibleRef.current = false;
              Animated.timing(pillAnim, { toValue: 0, duration: 50, useNativeDriver: true }).start();
            }
          }}
          onMomentumScrollEnd={(e: any) => {
            const y = e?.nativeEvent?.contentOffset?.y ?? 0;
            if (y <= 30) {
              setTabBarVisible(true);
            }
            if (y <= 20 && isPillVisibleRef.current) {
              isPillVisibleRef.current = false;
              Animated.timing(pillAnim, { toValue: 0, duration: 50, useNativeDriver: true }).start();
            }
          }}
          scrollEventThrottle={16}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              style={{ marginTop: 0 }}
              mascot="idle"
              title={isSelectedHoliday ? "Holiday 🌴" : "All clear!"}
              subtitle={isSelectedHoliday ? "Enjoy your day off. No classes today." : "No classes scheduled for this day. Relax or catch up on work."}
              action={subjects.length === 0 ? {
                label: "Setup Timetable",
                onPress: () => setIsTimetableOpen(true)
              } : undefined}
            />
          }
          renderItem={renderItem}
          ListFooterComponent={listFooter}
        />
      )}

      {/* ── Modals ── */}

      {/* Timetable Modal */}
      {isTimetableOpen && (
        <TimetableModal
          visible={isTimetableOpen}
          onClose={() => setIsTimetableOpen(false)}
          subjects={subjects}
          handleAddSubject={handleAddSubject}
          setEditSubject={setEditSubject}
          setShowAddModal={setShowAddModal}
          handleDeleteSubject={handleDeleteSubject}
          handleResetSemester={handleResetSemester}
        />
      )}

      {/* History Modal */}
      {!!selectedHistorySubject && (
        <Modal visible={!!selectedHistorySubject} animationType="slide" onRequestClose={() => setSelectedHistorySubject(null)}>
          <SafeAreaView style={styles.modalRoot}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedHistorySubject?.name} History
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
                  {sortedHistoryLogs.length} {sortedHistoryLogs.length === 1 ? 'log' : 'logs'} recorded • Newest first
                </Text>
              </View>
              <TouchableOpacity style={styles.modalHeaderBtn} onPress={() => setSelectedHistorySubject(null)}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Subject Attendance Stats Overview Strip */}
            {(() => {
              const sub = selectedHistorySubject;
              const att = (sub.classesAttended || 0) + (sub.labsAttended || 0);
              const tot = (sub.classesTotal || 0) + (sub.labsTotal || 0);
              const pct = tot > 0 ? (att / tot) * 100 : 100;
              const target = sub.targetPercentage || 75;
              const isSafe = pct >= target;

              return (
                <View style={styles.historyStatsBar}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 13, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>
                        Overall: {att}/{tot} attended
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted }}>
                        (Target: {target}%)
                      </Text>
                    </View>
                    <Text style={{ fontSize: 15, fontFamily: FONT_FAMILY.bold, color: isSafe ? (isDark ? '#34D399' : '#059669') : (isDark ? '#F87171' : '#DC2626') }}>
                      {tot > 0 ? `${Math.round(pct)}%` : '--%'}
                    </Text>
                  </View>

                  {/* Class vs Lab split if applicable */}
                  {((sub.labsTotal || 0) > 0 || (sub.classesTotal || 0) > 0) && (
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                      {(sub.classesTotal || 0) > 0 && (
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                          Class: <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>{sub.classesAttended || 0}/{sub.classesTotal || 0}</Text>
                        </Text>
                      )}
                      {(sub.labsTotal || 0) > 0 && (
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                          Lab: <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>{sub.labsAttended || 0}/{sub.labsTotal || 0}</Text>
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* List */}
            <FlatList
              data={sortedHistoryLogs}
              keyExtractor={l => l.id || `${l.date}_${l.timestamp}_${l.action}`}
              contentContainerStyle={{ padding: SPACE.md, paddingBottom: 60 }}
              renderItem={({ item: l }) => (
                <AttendanceHistoryRow
                  log={l}
                  colors={colors}
                  isDark={isDark}
                  styles={styles}
                  onUndo={handleUndo}
                />
              )}
              ListEmptyComponent={
                <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                  <Ionicons name="calendar-outline" size={40} color={colors.textMuted} style={{ marginBottom: 12, opacity: 0.6 }} />
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontFamily: FONT_FAMILY.bold, textAlign: 'center' }}>
                    No Logs Found
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                    Classes and labs you mark will appear here sorted from newest to oldest.
                  </Text>
                </View>
              }
            />
          </SafeAreaView>
        </Modal>
      )}

      {/* Extra Class Modal */}
      {isExtraOpen && (
        <BottomSheet visible={isExtraOpen} onClose={() => setIsExtraOpen(false)}>
          <View style={{ width: '100%' }}>
            <Text style={[styles.sheetTitle, { marginBottom: 16 }]}>Log Extra Class</Text>

            {/* Subject selector — vertical full-width pills */}
            <ScrollView style={{ maxHeight: 180, marginBottom: 20 }} showsVerticalScrollIndicator={false}>
              {subjects.map(s => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setExtraSubjectId(s.id!)}
                  style={[
                    styles.subjectSelectRow,
                    extraSubjectId === s.id && styles.subjectSelectRowActive,
                  ]}
                >
                  <View style={[styles.subjectSelectDot, extraSubjectId === s.id && { backgroundColor: colors.accentPrimary }]} />
                  <Text style={[styles.subjectSelectText, extraSubjectId === s.id && (isDark ? { color: '#ffffff' } : { color: '#1C1C1E', fontWeight: '600' })]}>{s.name}</Text>
                  {extraSubjectId === s.id && <Ionicons name="checkmark" size={14} color={colors.accentPrimary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Action rows — CLASS and LAB */}
            {(['class', 'lab'] as const).map(type => (
              <View key={type} style={styles.extraTypeRow}>
                <Text style={styles.extraTypeLabel}>{type === 'class' ? 'Class' : 'Lab'}</Text>
                <View style={styles.extraTypeActions}>
                  <TouchableOpacity
                    style={[styles.extraActionBtn, styles.extraActionAttended, !extraSubjectId && { opacity: 0.3 }]}
                    disabled={!extraSubjectId}
                    onPress={() => { handleLog(subjects.find(s => s.id === extraSubjectId)!, type, 'attended', undefined, 0, selectedDate, true); setIsExtraOpen(false); }}
                  >
                    <Ionicons name="checkmark" size={15} color={isDark ? "#5eda9e" : "#059669"} />
                    <Text style={styles.extraActionAttendedText}>Attended</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.extraActionBtn, styles.extraActionMissed, !extraSubjectId && { opacity: 0.3 }]}
                    disabled={!extraSubjectId}
                    onPress={() => { handleLog(subjects.find(s => s.id === extraSubjectId)!, type, 'missed', undefined, 0, selectedDate, true); setIsExtraOpen(false); }}
                  >
                    <Ionicons name="close" size={15} color={isDark ? "#ff6961" : "#DC2626"} />
                    <Text style={styles.extraActionMissedText}>Missed</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.extraCancelBtn} onPress={() => setIsExtraOpen(false)}>
              <Text style={styles.extraCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>
      )}

      {/* Custom Confirm Modal */}
      {confirmConfig.visible && (
        <Modal visible={confirmConfig.visible} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: SPACE.xl }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: SPACE.xl, width: '100%', maxWidth: 400 }}>
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginBottom: 8 }}>{confirmConfig.title}</Text>
              <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: 24, lineHeight: 20 }}>{confirmConfig.message}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                <TouchableOpacity onPress={() => setConfirmConfig(p => ({ ...p, visible: false }))} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.textMuted }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmConfig.onConfirm} style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: confirmConfig.danger ? colors.error : colors.accentPrimary, borderRadius: 8 }}>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, color: confirmConfig.danger ? '#fff' : (isDark ? '#000' : '#fff') }}>{confirmConfig.confirmText || 'Confirm'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
      
      {/* Add Subject Modal */}
      {showAddModal && (
        <AddSubjectModal 
          visible={showAddModal} 
          onClose={() => setShowAddModal(false)} 
          existingSubject={editSubject} 
        />
      )}

      {/* Class Notification Preferences Modal */}
      {showClassNotifModal && (
        <ClassNotifSettingsModal
          visible={showClassNotifModal}
          onClose={() => setShowClassNotifModal(false)}
        />
      )}

      </View>
    </View>
  );
}
