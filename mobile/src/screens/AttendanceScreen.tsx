import React, { useRef, useCallback } from 'react';
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
  getLocalDateString, formatDisplayDate, getWeekDates, 
  calculateStatus, getProgressColor, parseTimeToMinutes 
} from './attendance/attendanceConstants';
import { calculateBunkMath } from '../utils/academicMath';
import { FONT_FAMILY, SPACE, RADIUS, SHADOW, FONT_SIZE } from '../theme/tokens';
import { makeStyles } from './attendance/attendanceStyles';
import { useAttendanceData } from './attendance/useAttendanceData';
import { useAttendanceFirestore } from './attendance/useAttendanceFirestore';
import { useAttendanceExport } from './attendance/useAttendanceExport';
import { HorizontalWeekStrip } from './attendance/HorizontalWeekStrip';
import ErrorBoundary from '../components/ErrorBoundary';
import EmptyState from '../components/ui/EmptyState';
import { setTabBarVisible } from '../utils/tabBarScroll';
import BottomSheet from '../components/ui/BottomSheet';
import type { AttendanceSubject } from '../contexts/MobileDataContext';

// ── Pure Memoized Session Action Row ─────────────────────────────────────────
interface SessionRowProps {
  session: any;
  log: any;
  colors: any;
  isDark: boolean;
  styles: any;
  onUndo: (logId: string) => void;
  onLog: (subject: any, type: 'class' | 'lab', action: 'attended' | 'missed' | 'cancelled') => void;
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

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: colors.border }}>
      {/* Left: subject name + time + type badge */}
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>{subject.name}</Text>
        {/* Time + inline badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{session.timeStr}</Text>
          <View style={{
            paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
            backgroundColor: isLab 
              ? (isDark ? 'rgba(250,215,161,0.15)' : 'rgba(2,132,199,0.12)')
              : (isDark ? 'rgba(137,220,235,0.12)' : 'rgba(108,92,231,0.12)'),
          }}>
            <Text style={{
              fontSize: 8, fontWeight: '700', letterSpacing: 0.4,
              color: isLab 
                ? (isDark ? '#FAD7A1' : '#0284C7')
                : (isDark ? '#89dceb' : '#6C5CE7'),
            }}>{isLab ? 'LAB' : 'CLASS'}</Text>
          </View>
        </View>
      </View>

      {/* Right: action buttons */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {log ? (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onUndo(log.id);
            }}
            style={styles.undoBtn}
          >
            <Text style={{
              color: log.action === 'attended' ? colors.priorityLow : (log.action === 'cancelled' ? colors.textMuted : colors.error),
              fontSize: 12, fontWeight: '600'
            }}>
              {log.action === 'attended' ? 'Present' : log.action === 'cancelled' ? 'Cancelled' : 'Absent'} ↩
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.btnPresent}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onLog(subject, type, 'attended');
              }}
            >
              <Text style={{ color: colors.priorityLow, fontSize: 12, fontWeight: '600' }}>Present</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnAbsent}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onLog(subject, type, 'missed');
              }}
            >
              <Text style={{ color: colors.error, fontSize: 12, fontWeight: '600' }}>Absent</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnCancelled}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onLog(subject, type, 'cancelled');
              }}
            >
              <Ionicons name="close" size={18} color={isDark ? colors.textMuted : colors.textSecondary} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
});

// ── Pure Memoized Subject Summary Row (By Subject with Bunk Budget) ──────────
interface SubjectSummaryRowProps {
  subject: AttendanceSubject;
  colors: any;
  isDark: boolean;
  onPress: () => void;
}

const SubjectSummaryRow = React.memo(function SubjectSummaryRow({
  subject,
  colors,
  isDark,
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

  return (
    <View>
      <TouchableOpacity onPress={onPress} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>{subject.name}</Text>
          <Text style={{ color: pColor, fontSize: 16, fontWeight: '600' }}>
            {combinedStatus.pct !== null ? `${Math.round(combinedStatus.pct)}%` : '--%'}
          </Text>
        </View>
        
        <View style={{ gap: 6 }}>
          {hasClasses && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, minWidth: 62, alignItems: 'center' }}>
                <Text style={{ color: colors.accentPrimary, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>CLASS</Text>
              </View>
              <View style={{ flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
                <View style={{ 
                  height: '100%', borderRadius: 3, width: `${Math.min(100, classStatus.pct || 0)}%`, backgroundColor: getThemeProgressColor(classStatus.urgency),
                }} />
              </View>
              <Text style={{ color: colors.textTertiary, fontSize: 11, width: 24, textAlign: 'right' }}>
                {subject.classesAttended || 0}/{subject.classesTotal || 0}
              </Text>
            </View>
          )}
          {hasLabs && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ backgroundColor: isDark ? 'rgba(250,215,161,0.15)' : 'rgba(2,132,199,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, minWidth: 62, alignItems: 'center' }}>
                <Text style={{ color: isDark ? '#FAD7A1' : colors.accentBlue, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>LAB</Text>
              </View>
              <View style={{ flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
                <View style={{ 
                  height: '100%', borderRadius: 3, width: `${Math.min(100, labStatus.pct || 0)}%`, backgroundColor: getThemeProgressColor(labStatus.urgency),
                }} />
              </View>
              <Text style={{ color: colors.textTertiary, fontSize: 11, width: 24, textAlign: 'right' }}>
                {subject.labsAttended || 0}/{subject.labsTotal || 0}
              </Text>
            </View>
          )}
          
          {!hasLabs && (() => {
            const bunk = calculateBunkMath(
              subject.classesAttended || 0,
              subject.classesTotal || 0,
              subject.targetPercentage || 75
            );
            if ((bunk.status === 'safe' && bunk.count > 0) || bunk.status === 'warning') {
              const budgetColor = bunk.status === 'safe' ? colors.priorityLow : colors.priorityMed;
              const budgetBg = bunk.status === 'safe' 
                ? (isDark ? 'rgba(94,218,158,0.12)' : 'rgba(16,185,129,0.12)') 
                : (isDark ? 'rgba(245,158,11,0.12)' : 'rgba(217,119,6,0.12)');
              const budgetLabel = bunk.status === 'safe' ? `✓ Can miss ${bunk.count} more` : `⚠️ 0 misses left`;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <View style={{ backgroundColor: budgetBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                    <Text style={{ color: budgetColor, fontSize: 11, fontWeight: '600', letterSpacing: 0.2 }}>{budgetLabel}</Text>
                  </View>
                </View>
              );
            }
            return null;
          })()}
        </View>
      </TouchableOpacity>

      {/* Inline recovery hint */}
      {(() => {
        const pct = totalCls > 0 ? (totalAtt / totalCls) * 100 : 100;
        const target = subject.targetPercentage || 75;
        if (pct < target) {
          const needed = Math.ceil(((target / 100) * totalCls - totalAtt) / (1 - (target / 100)));
          return (
            <Text style={{ color: colors.error, fontSize: 11, marginTop: 6, marginBottom: 4, fontFamily: FONT_FAMILY.medium }}>
              Attend {needed} more {needed === 1 ? 'class' : 'classes'} to reach {target}%
            </Text>
          );
        }
        return null;
      })()}
    </View>
  );
});

export default function AttendanceScreen() {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);
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
    optimisticRemoveAttendanceLog: academic.optimisticRemoveAttendanceLog,
    optimisticDeleteSubject: academic.optimisticDeleteSubject,
  });
  const {
    handleLog, handleUndo, handleToggleHoliday, handleDeleteSubject,
    handleApplyOverride, handleResetSemester
  } = firestoreActions;

  // 3. Export Hook
  const exportActions = useAttendanceExport(logs, holidays, subjects);
  const { handleExportCSV } = exportActions;

  const handleAddSubject = () => {
    setEditSubject(null);
    setShowAddModal(true);
  };

  const renderItem = useCallback(({ item: session }: { item: any }) => {
    const { subject, type, idx } = session;
    const subLogs = logsBySubjectId[subject.id!] || [];
    let log = null;
    let matchIdx = 0;
    for (let i = 0; i < subLogs.length; i++) {
      const l = subLogs[i];
      if (l.date === selectedDate && !l.isExtra && (type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type))) {
        if (matchIdx === idx) {
          log = l;
          break;
        }
        matchIdx++;
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
            onChange={(e, date) => {
              setShowDatePicker(false);
              if (date) setSelectedDate(getLocalDateString(date));
            }}
          />
        )}

        <FlatList
          data={isSelectedHoliday ? [] : todayFlatSessions}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 120, paddingTop: insets.top + 54 }}
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
          ListHeaderComponent={
          <>
            {/* ── Semester Overview ── */}
            <View style={{ paddingHorizontal: 8, marginBottom: 8 }}>
              <View style={styles.overviewCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.overviewTitle}>Semester overview</Text>
                  <Text style={styles.overviewStats}>{globalAttended}/{globalTotal} classes</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <Text style={[styles.overviewPct, { color: globalPct !== null ? (globalPct >= 75 ? colors.priorityLow : (globalPct >= 70 ? colors.priorityMed : colors.priorityHigh)) : colors.textMuted }]}>
                    {globalPct !== null ? `${Math.round(globalPct)}%` : '--%'}
                  </Text>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${Math.min(100, globalPct || 0)}%`, backgroundColor: globalPct !== null ? (globalPct >= 75 ? colors.priorityLow : (globalPct >= 70 ? colors.priorityMed : colors.priorityHigh)) : colors.border }]} />
                  </View>
                </View>
              </View>
            </View>

            {/* ── Warnings ── */}
            {warningSubjects.length > 0 && (
              <View style={styles.warningBanner}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="warning" size={16} color={isDark ? "#f59e0b" : "#D97706"} />
                    <Text style={styles.warningTitle}>Low Attendance</Text>
                  </View>
                  <TouchableOpacity onPress={() => setDismissedWarnings(new Set(warningSubjects.map(s => s.id!)))}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={{ marginTop: 4, gap: 4 }}>
                  {warningSubjects.map(s => {
                    const att = (s.classesAttended || 0) + (s.labsAttended || 0);
                    const tot = (s.classesTotal || 0) + (s.labsTotal || 0);
                    const pct = tot > 0 ? Math.round((att/tot)*100) : 0;
                    const targetPct = s.targetPercentage || 75;
                    const need = Math.max(0, Math.ceil((targetPct * tot - 100 * att) / (100 - targetPct)));
                    return (
                      <Text key={s.id} style={styles.warningText}>
                        • <Text style={{ fontWeight: 'bold' }}>{s.name}</Text>: {pct}% — attend {need} more to recover
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8 }}>
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Today's Classes</Text>
              <TouchableOpacity onPress={() => setIsExtraOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '500' }}>Extra Class</Text>
                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </>
        }
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
        ListFooterComponent={
          todayScheduledSubjects.length > 0 && !isSelectedHoliday ? (
            <View style={{ marginTop: 24, marginBottom: 56 }}>
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>By Subject</Text>
              {todayScheduledSubjects.map(subject => (
                <SubjectSummaryRow
                  key={subject.id}
                  subject={subject}
                  colors={colors}
                  isDark={isDark}
                  onPress={() => setSelectedHistorySubject(subject)}
                />
              ))}
            </View>
          ) : null
        }
      />

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
          handleExportCSV={handleExportCSV}
          handleResetSemester={handleResetSemester}
        />
      )}

      {/* History Modal */}
      {!!selectedHistorySubject && (
        <Modal visible={!!selectedHistorySubject} animationType="slide">
          <SafeAreaView style={styles.modalRoot}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedHistorySubject?.name} History</Text>
              <TouchableOpacity style={styles.modalHeaderBtn} onPress={() => setSelectedHistorySubject(null)}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={selectedHistorySubject ? logs.filter(l => l.subjectId === selectedHistorySubject.id) : []}
              keyExtractor={l => l.id || ''}
              contentContainerStyle={{ padding: SPACE.md }}
              renderItem={({ item: l }) => (
                <View style={styles.historyCard}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 14, color: l.action === 'attended' ? colors.priorityLow : colors.error }}>
                      {l.action === 'attended' ? '✓ Attended' : '✗ Missed'} <Text style={{ color: colors.textPrimary }}>{l.isExtra ? '(Extra) ' : ''}{l.type||'class'}</Text>
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{formatDisplayDate(l.date)} • {new Date(l.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</Text>
                  </View>
                  <TouchableOpacity onPress={() => l.id && handleUndo(l.id)} style={styles.undoBtn}>
                    <Ionicons name="refresh" size={14} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: SPACE.xl }}>No logs found for this subject.</Text>
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
                    onPress={() => { handleLog(subjects.find(s => s.id === extraSubjectId)!, type, 'attended', selectedDate, true); setIsExtraOpen(false); }}
                  >
                    <Ionicons name="checkmark" size={15} color={isDark ? "#5eda9e" : "#059669"} />
                    <Text style={styles.extraActionAttendedText}>Attended</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.extraActionBtn, styles.extraActionMissed, !extraSubjectId && { opacity: 0.3 }]}
                    disabled={!extraSubjectId}
                    onPress={() => { handleLog(subjects.find(s => s.id === extraSubjectId)!, type, 'missed', selectedDate, true); setIsExtraOpen(false); }}
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
