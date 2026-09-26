import React, { useRef, useCallback, useMemo, useState, useEffect, Suspense } from 'react';
import {
  View, Text, FlatList, SectionList, TouchableOpacity, ScrollView,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, StyleSheet
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import SaraHUDBanner from '../components/SARA/SaraHUDBanner';
import { useTheme } from "../contexts/ThemeContext";
import { useSaraSurface } from '../hooks/useSaraSurface';
import { useAcademicData } from '../contexts/domains/AcademicContext';

// â”€â”€ Lazy-loaded Modals: Skips parsing ~1,400 LOC of modals on initial boot / tab warm-up â”€â”€
const AddSubjectModal = React.lazy(() => import('../components/Academic/AddSubjectModal').then(m => ({ default: m.AddSubjectModal })));
const TimetableModal = React.lazy(() => import('../components/Academic/TimetableModal').then(m => ({ default: m.TimetableModal })));
const ClassNotifSettingsModal = React.lazy(() => import('../components/Academic/ClassNotifSettingsModal'));
const SubjectHistoryModal = React.lazy(() => import('../components/Academic/SubjectHistoryModal'));

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
import SubjectContextMenuModal from '../components/Academic/SubjectContextMenuModal';
import AnimatedPressable from '../components/AnimatedPressable';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  interpolateColor,
  FadeIn,
  FadeOut,
  FadeInDown,
  SlideOutRight,
  LinearTransition,
  Easing,
} from 'react-native-reanimated';
import { Svg, Circle } from 'react-native-svg';

// ── Spring-Compressing Action Chip (Frame-0 Touch Physics) ──
const SpringChip = React.memo(function SpringChip({
  onPress,
  style,
  children,
  hapticType = 'light',
}: {
  onPress: () => void;
  style?: any;
  children: React.ReactNode;
  hapticType?: 'light' | 'medium' | 'success';
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      haptic={hapticType}
      variant="button"
      style={style}
    >
      {children}
    </AnimatedPressable>
  );
});

// ── Apple iOS Tactile Header Action Button (Frame-0 Touch Physics) ──
const TactileHeaderBtn = React.memo(function TactileHeaderBtn({
  onPress,
  children,
  style,
  haptic = 'light',
}: {
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
  haptic?: 'light' | 'medium';
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      haptic={haptic}
      variant="button"
      style={style}
    >
      {children}
    </AnimatedPressable>
  );
});

// â”€â”€ Smooth Rolling Number Counter (300ms Cubic Ease-Out) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const RollingNumber = React.memo(function RollingNumber({
  value,
  suffix = '',
  style,
}: {
  value: number;
  suffix?: string;
  style?: any;
}) {
  const [displayVal, setDisplayVal] = useState(value);
  const animVal = useRef(value);

  useEffect(() => {
    if (animVal.current === value) return;
    const start = animVal.current;
    const end = value;
    const duration = 300;
    const startTime = Date.now();

    const timer = setInterval(() => {
      const now = Date.now();
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplayVal(current);
      if (progress >= 1) {
        clearInterval(timer);
        animVal.current = end;
      }
    }, 16);

    return () => clearInterval(timer);
  }, [value]);

  return <Text style={style}>{displayVal}{suffix}</Text>;
});

// â”€â”€ Elastic Progress Bar with Spring Deceleration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ElasticProgressBar = React.memo(function ElasticProgressBar({
  pct,
  color,
  style,
  height = 6,
}: {
  pct: number;
  color: string;
  style?: any;
  height?: number;
}) {
  const animatedPct = useSharedValue(pct);

  useEffect(() => {
    animatedPct.value = withTiming(Math.max(0, Math.min(100, pct)), {
      duration: 320,
    });
  }, [pct, animatedPct]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedPct.value}%`,
    backgroundColor: color,
  }));

  return (
    <View style={[{ height, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: height / 2, overflow: 'hidden' }, style]}>
      <Reanimated.View style={[{ height: '100%', borderRadius: height / 2 }, animatedStyle]} />
    </View>
  );
});

// â”€â”€ Bunk Safety Gauge Circular Ring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BunkSafetyRing = React.memo(function BunkSafetyRing({
  pct,
  color,
  size = 32,
  strokeWidth = 3,
}: {
  pct: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.max(0, Math.min(100, pct));
  const strokeDashoffset = circumference - (circumference * clampedPct) / 100;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
});

// â”€â”€ Pure Memoized Session Action Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface SessionRowProps {
  session: any;
  sessionIndex?: number;
  log: any;
  colors: any;
  isDark: boolean;
  styles: any;
  onUndo: (logId: string) => void;
  onLog: (subject: any, type: 'class' | 'lab', action: 'attended' | 'missed' | 'cancelled', existingLogId: string | undefined, sessionIdx: number, logDate?: string, isExtra?: boolean) => void;
}

const AttendanceSessionRow = React.memo(function AttendanceSessionRow({
  session,
  sessionIndex,
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
  const [localAction, setLocalAction] = useState<'attended' | 'missed' | 'cancelled' | null>(
    log?.action ?? null
  );

  // Fix #6: Debounce guard to prevent rapid-tap race conditions.
  // Without this, tapping Present twice quickly to untoggle fails because
  // log?.id is undefined in the closure on the first frame (optimistic log
  // hasn't been assigned an ID yet), causing onUndo to abort silently while
  // the first tap already committed to Firestore.
  const processingRef = useRef(false);

  useEffect(() => {
    setLocalAction(log?.action ?? null);
  }, [log?.action, log?.id]);

  const isPresent = localAction === 'attended';
  const isAbsent = localAction === 'missed';
  const isCancelled = localAction === 'cancelled';

  const { idx: sessionIdx } = session;
  const isExtra = !!session.isExtra;

  // Existing WhatsApp-grade fluid reaction flash overlays
  const emeraldRipple = useSharedValue(0);
  const crimsonWave   = useSharedValue(0);

  const animEmeraldStyle = useAnimatedStyle(() => ({
    opacity: emeraldRipple.value,
  }));

  const animCrimsonStyle = useAnimatedStyle(() => ({
    opacity: crimsonWave.value,
  }));

  // rowColorVal: 0=neutral, 1=present, -1=absent, 0.5=cancelled
  const rowColorVal = useSharedValue(
    log?.action === 'attended' ? 1 : log?.action === 'missed' ? -1 : log?.action === 'cancelled' ? 0.5 : 0
  );

  const rowBgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      rowColorVal.value,
      [-1, -0.5, 0, 0.5, 1],
      [
        isDark ? 'rgba(239,68,68,0.10)'  : 'rgba(220,38,38,0.07)',
        isDark ? 'rgba(239,68,68,0.05)'  : 'rgba(220,38,38,0.03)',
        'transparent',
        isDark ? 'rgba(161,161,170,0.07)': 'rgba(113,113,122,0.05)',
        isDark ? 'rgba(52,211,153,0.10)' : 'rgba(16,185,129,0.08)',
      ],
    ),
  }));

  const handlePressPresent = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;
    setTimeout(() => { processingRef.current = false; }, 300);
    if (isPresent) {
      setLocalAction(null);
      rowColorVal.value = withTiming(0, { duration: 200 });
      if (log?.id) onUndo(log.id);
    } else {
      emeraldRipple.value = withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(0, { duration: 420 })
      );
      setLocalAction('attended');
      onLog(subject, type, 'attended', log?.id, sessionIdx, undefined, isExtra);
    }
  }, [isPresent, log?.id, onUndo, onLog, subject, type, sessionIdx, isExtra, emeraldRipple, rowColorVal]);

  const handlePressAbsent = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;
    setTimeout(() => { processingRef.current = false; }, 300);
    if (isAbsent) {
      setLocalAction(null);
      rowColorVal.value = withTiming(0, { duration: 200 });
      if (log?.id) onUndo(log.id);
    } else {
      crimsonWave.value = withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(0, { duration: 380 })
      );
      setLocalAction('missed');
      onLog(subject, type, 'missed', log?.id, sessionIdx, undefined, isExtra);
    }
  }, [isAbsent, log?.id, onUndo, onLog, subject, type, sessionIdx, isExtra, crimsonWave, rowColorVal]);

  const handlePressCancelled = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;
    setTimeout(() => { processingRef.current = false; }, 300);
    if (isCancelled) {
      setLocalAction(null);
      rowColorVal.value = withTiming(0, { duration: 200 });
      if (log?.id) onUndo(log.id);
    } else {
      rowColorVal.value = withTiming(0.5, { duration: 220 });
      setLocalAction('cancelled');
      onLog(subject, type, 'cancelled', log?.id, sessionIdx, undefined, isExtra);
    }
  }, [isCancelled, log?.id, onUndo, onLog, subject, type, sessionIdx, isExtra, rowColorVal]);

  return (
    <Reanimated.View
      entering={FadeIn.duration(180)}
      style={[styles.sessionCard, { position: 'relative', overflow: 'hidden' }, rowBgStyle]}
    >
      {/* WhatsApp Emerald Glow Ripple Overlay */}
      <Reanimated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: isDark ? 'rgba(52, 211, 153, 0.20)' : 'rgba(16, 185, 129, 0.16)',
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: isDark ? 'rgba(52, 211, 153, 0.45)' : 'rgba(16, 185, 129, 0.40)',
          },
          animEmeraldStyle,
        ]}
      />

      {/* WhatsApp Crimson Warning Wave Overlay */}
      <Reanimated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(220, 38, 38, 0.10)',
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: isDark ? 'rgba(239, 68, 68, 0.45)' : 'rgba(220, 38, 38, 0.35)',
          },
          animCrimsonStyle,
        ]}
      />

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

      {/* Right: Segmented Present / Absent / Cancelled Toggle with Spring Compressing Chips */}
      <View style={styles.segmentedToggleContainer}>
        {/* Present segment */}
        <SpringChip
          onPress={handlePressPresent}
          hapticType="success"
          style={[
            styles.segmentBtn,
            isPresent && styles.segmentBtnPresentActive,
          ]}
        >
          <Text style={[styles.segmentBtnText, isPresent && styles.segmentBtnPresentTextActive]}>
            Present
          </Text>
        </SpringChip>

        {/* Absent segment */}
        <SpringChip
          onPress={handlePressAbsent}
          hapticType="medium"
          style={[
            styles.segmentBtn,
            isAbsent && styles.segmentBtnAbsentActive,
          ]}
        >
          <Text style={[styles.segmentBtnText, isAbsent && styles.segmentBtnAbsentTextActive]}>
            Absent
          </Text>
        </SpringChip>

        {/* Cancelled (Cross) segment */}
        <SpringChip
          onPress={handlePressCancelled}
          hapticType="light"
          style={[
            styles.segmentIconBtn,
            isCancelled && styles.segmentBtnCancelledActive,
          ]}
        >
          <Ionicons
            name="close"
            size={15}
            color={isCancelled ? (isDark ? '#F2F2F7' : '#1C1C1E') : (isDark ? '#8E8E93' : '#6B7280')}
          />
        </SpringChip>
      </View>
    </Reanimated.View>
  );
}, (prev, next) => {
  return (
    prev.session.id === next.session.id &&
    prev.session.timeStr === next.session.timeStr &&
    prev.session.type === next.session.type &&
    prev.session.subject?.id === next.session.subject?.id &&
    prev.session.subject?.name === next.session.subject?.name &&
    prev.log?.id === next.log?.id &&
    prev.log?.action === next.log?.action &&
    prev.isDark === next.isDark &&
    prev.colors === next.colors &&
    prev.styles === next.styles &&
    prev.onUndo === next.onUndo &&
    prev.onLog === next.onLog
  );
});

// â”€â”€ Pure Memoized Subject Summary Row (By Subject with Decoupled Plain Labels) â”€â”€
interface SubjectSummaryRowProps {
  subject: AttendanceSubject;
  index?: number;
  colors: any;
  isDark: boolean;
  styles: any;
  onSelect: (subject: AttendanceSubject) => void;
  onLongPress?: (subject: AttendanceSubject) => void;
}

const SubjectSummaryRow = React.memo(function SubjectSummaryRow({
  subject,
  index,
  colors,
  isDark,
  styles,
  onSelect,
  onLongPress,
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

  const handlePress = useCallback(() => {
    onSelect(subject);
  }, [onSelect, subject]);

  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      onLongPress(subject);
    }
  }, [onLongPress, subject]);

  // Cleanly resolved bunk message without inline IIFE
  let bunkElement: React.ReactNode = null;
  if (bunk.status === 'safe' && bunk.count > 0) {
    bunkElement = (
      <View style={styles.bySubjectBunkRow}>
        <Ionicons name="checkmark-circle-outline" size={13.5} color={colors.priorityLow || '#30D158'} style={{ marginRight: 4 }} />
        <Text style={{ color: colors.priorityLow || '#30D158', fontSize: 12, fontFamily: FONT_FAMILY.medium }}>
          Can miss <RollingNumber value={bunk.count} style={{ color: colors.priorityLow || '#30D158', fontSize: 12, fontFamily: FONT_FAMILY.bold }} /> more
        </Text>
      </View>
    );
  } else if (bunk.status === 'warning') {
    bunkElement = (
      <View style={styles.bySubjectBunkRow}>
        <Ionicons name="alert-circle-outline" size={13.5} color={colors.priorityMed || '#FF9F0A'} style={{ marginRight: 4 }} />
        <Text style={{ color: colors.priorityMed || '#FF9F0A', fontSize: 12, fontFamily: FONT_FAMILY.medium }}>
          0 misses left â€” attend all next classes
        </Text>
      </View>
    );
  } else if (bunk.status === 'critical') {
    const needed = bunk.count;
    bunkElement = (
      <View style={styles.bySubjectBunkRow}>
        <Ionicons name="warning-outline" size={13.5} color={colors.error || '#FF453A'} style={{ marginRight: 4 }} />
        <Text style={{ color: colors.error || '#FF453A', fontSize: 12, fontFamily: FONT_FAMILY.medium }}>
          Attend <RollingNumber value={needed} style={{ color: colors.error || '#FF453A', fontSize: 12, fontFamily: FONT_FAMILY.bold }} /> more {needed === 1 ? 'class' : 'classes'} to reach {subject.targetPercentage || 75}%
        </Text>
      </View>
    );
  }

  return (
    <AnimatedPressable
      entering={FadeIn.duration(180)}
      variant="card"
      haptic="selection"
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={styles.bySubjectCard}
    >
        {/* Top row: Subject name and overall percentage pill */}
        <View style={styles.bySubjectHeaderRow}>
          <Text style={[styles.bySubjectName, { flex: 1, marginRight: 10 }]} numberOfLines={1}>{subject.name}</Text>
          {combinedStatus.pct !== null ? (
            <View style={[styles.bySubjectPctBadge, { backgroundColor: pColor + '14', borderColor: pColor + '35' }]}>
              <RollingNumber
                value={Math.round(combinedStatus.pct)}
                suffix="%"
                style={[styles.bySubjectPct, { color: pColor }]}
              />
            </View>
          ) : (
            <View style={[styles.bySubjectPctBadge, { backgroundColor: (colors.border || '#333') + '20', borderColor: colors.border }]}>
              <Text style={[styles.bySubjectPct, { color: colors.textTertiary }]}>--%</Text>
            </View>
          )}
        </View>

        {/* Decoupled Progress Bars with Elastic Spring Sweep */}
        <View style={{ gap: 8 }}>
          {hasClasses && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.plainTrackLabel}>Class</Text>
              <ElasticProgressBar
                pct={classStatus.pct || 0}
                color={getThemeProgressColor(classStatus.urgency)}
                style={{ flex: 1 }}
                height={6}
              />
              <Text style={styles.plainTrackCount}>
                {subject.classesAttended || 0}/{subject.classesTotal || 0}
              </Text>
            </View>
          )}

          {hasLabs && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.plainTrackLabel}>Lab</Text>
              <ElasticProgressBar
                pct={labStatus.pct || 0}
                color={getThemeProgressColor(labStatus.urgency)}
                style={{ flex: 1 }}
                height={6}
              />
              <Text style={styles.plainTrackCount}>
                {subject.labsAttended || 0}/{subject.labsTotal || 0}
              </Text>
            </View>
          )}

          {/* Bottom Status / Bunk Message */}
          {bunkElement}
        </View>
    </AnimatedPressable>
  );
}, (prev, next) => {
  return (
    prev.subject.id === next.subject.id &&
    prev.subject.classesAttended === next.subject.classesAttended &&
    prev.subject.classesTotal === next.subject.classesTotal &&
    prev.subject.labsAttended === next.subject.labsAttended &&
    prev.subject.labsTotal === next.subject.labsTotal &&
    prev.subject.targetPercentage === next.subject.targetPercentage &&
    prev.subject.name === next.subject.name &&
    prev.isDark === next.isDark &&
    prev.colors === next.colors &&
    prev.styles === next.styles &&
    prev.onSelect === next.onSelect &&
    prev.onLongPress === next.onLongPress
  );
});



interface UnloggedSessionRowProps {
  item: {
    id: string;
    subject: AttendanceSubject;
    date: string;
    type: 'class' | 'lab';
    idx: number;
    timeMins: number;
    timeStr: string;
  };
  colors: any;
  isDark: boolean;
  styles: any;
  onSelectDate: (date: string) => void;
  onLog: (
    subject: AttendanceSubject,
    type: 'class' | 'lab',
    action: 'attended' | 'missed' | 'cancelled',
    existingLogId?: string,
    sessionIdx?: number,
    logDate?: string,
    isExtra?: boolean
  ) => void;
}

const UnloggedSessionRow = React.memo(function UnloggedSessionRow({
  item,
  colors,
  isDark,
  styles,
  onSelectDate,
  onLog,
}: UnloggedSessionRowProps) {
  const isLab = item.type === 'lab';
  const dateInfo = formatAttendanceHistoryDate(item.date);

  const handlePressCard = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectDate(item.date);
  }, [item.date, onSelectDate]);

  const handlePresent = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLog(item.subject, item.type, 'attended', undefined, item.idx, item.date, false);
  }, [item.subject, item.type, item.idx, item.date, onLog]);

  const handleAbsent = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLog(item.subject, item.type, 'missed', undefined, item.idx, item.date, false);
  }, [item.subject, item.type, item.idx, item.date, onLog]);

  const handleCancelled = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLog(item.subject, item.type, 'cancelled', undefined, item.idx, item.date, false);
  }, [item.subject, item.type, item.idx, item.date, onLog]);

  return (
    <Reanimated.View
      layout={LinearTransition.duration(220).easing(Easing.bezier(0.16, 1, 0.3, 1))}
      entering={FadeInDown.duration(180).easing(Easing.bezier(0.16, 1, 0.3, 1))}
      exiting={SlideOutRight.duration(200).easing(Easing.bezier(0.16, 1, 0.3, 1))}
      style={styles.unloggedCard}
    >
      <AnimatedPressable variant="row" haptic="light" onPress={handlePressCard}>
        <View style={styles.unloggedHeaderRow}>
          <Text style={styles.unloggedSubjectName} numberOfLines={1}>
            {item.subject.name}
          </Text>
          <View style={[styles.historyTypePill, isLab ? styles.historyTypePillLab : styles.historyTypePillClass]}>
            <Text style={[styles.historyTypeText, isLab ? styles.historyTypeTextLab : styles.historyTypeTextClass]}>
              {isLab ? 'LAB' : 'CLASS'}
            </Text>
          </View>
        </View>

        <View style={styles.unloggedMetaRow}>
          <View style={styles.unloggedDateBadge}>
            <Ionicons name="calendar-outline" size={11} color={colors.textSecondary} />
            <Text style={styles.unloggedDateBadgeText}>
              {dateInfo.dayLabel ? `${dateInfo.dayLabel}, ` : ''}{formatDisplayDate(item.date)}
            </Text>
          </View>
          <Text style={styles.unloggedTimeText}>
            â±ï¸ {item.timeStr}
          </Text>
        </View>
      </AnimatedPressable>

      {/* Quick 1-Tap Logging Actions with Spring Compressing Chips */}
      <View style={styles.unloggedActionsRow}>
        <SpringChip
          style={[styles.unloggedActionBtn, styles.unloggedActionBtnPresent]}
          onPress={handlePresent}
          hapticType="success"
        >
          <Ionicons name="checkmark" size={13} color={isDark ? '#34D399' : '#059669'} />
          <Text style={styles.unloggedActionTextPresent}>Present</Text>
        </SpringChip>

        <SpringChip
          style={[styles.unloggedActionBtn, styles.unloggedActionBtnAbsent]}
          onPress={handleAbsent}
          hapticType="medium"
        >
          <Ionicons name="close" size={13} color={isDark ? '#F87171' : '#DC2626'} />
          <Text style={styles.unloggedActionTextAbsent}>Absent</Text>
        </SpringChip>

        <SpringChip
          style={[styles.unloggedActionBtn, styles.unloggedActionBtnCancel]}
          onPress={handleCancelled}
          hapticType="light"
        >
          <Ionicons name="ban" size={12} color={isDark ? '#FBBF24' : '#D97706'} />
          <Text style={styles.unloggedActionTextCancel}>Cancelled</Text>
        </SpringChip>
      </View>
    </Reanimated.View>
  );
});



export default function AttendanceScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();

  const [contextMenuSubject, setContextMenuSubject] = useState<AttendanceSubject | null>(null);

  // Helper for theme-aware progress colors
  const getThemeProgressColor = (urgency: string) =>
    urgency === 'danger' ? colors.priorityHigh : urgency === 'warning' ? colors.priorityMed : colors.priorityLow;

  // â”€â”€ Animated pill visibility: 0 at top (pills invisible), fades in on scroll past 20px â”€â”€
  const pillAnim = useRef(new Animated.Value(0)).current;
  const isPillVisibleRef = useRef(false);
  const lastScrollY = useRef(0);
  const flatListRef = useRef<any>(null);

  useFocusEffect(
    useCallback(() => {
      // Delay the scroll reset by 50ms so it fires after the tab-switch
      // transition animation frame completes. Firing it immediately causes
      // visible jitter because the list is snapping while the screen is
      // still sliding in. At 50ms the transition is done but the eye hasn't
      // settled on content yet â€” the reset is invisible.
      const t = setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        isPillVisibleRef.current = false;
        pillAnim.setValue(0);
      }, 50);
      return () => clearTimeout(t);
    }, [pillAnim])
  );

  const updatePillVisibility = useCallback((offsetY: number) => {
    const shouldShow = offsetY > 20;
    if (shouldShow !== isPillVisibleRef.current) {
      isPillVisibleRef.current = shouldShow;
      Animated.timing(pillAnim, {
        toValue: shouldShow ? 1 : 0,
        duration: shouldShow ? 140 : 80,
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
    isUnloggedOpen, setIsUnloggedOpen,
    unloggedSessions, unloggedCount,
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
  const surfaceData = useMemo(() => ({ subjects, logs }), [subjects, logs]);
  const { surfaceMessage, surfaceActionLabel, dismissBanner } = useSaraSurface("AttendanceScreen", surfaceData as any, user?.uid);

  const firestoreActions = useAttendanceFirestore({
    user, subjects, logs, selectedDate, logsBySubjectId,
    overrideCounts, setOverrideOpen, setConfirmConfig,
    optimisticUpdateAttendance: academic.optimisticUpdateAttendance,
    optimisticAddAttendanceLog: academic.optimisticAddAttendanceLog,
    optimisticUpdateAttendanceLog: academic.optimisticUpdateAttendanceLog,
    optimisticRemoveAttendanceLog: academic.optimisticRemoveAttendanceLog,
    optimisticDeleteSubject: academic.optimisticDeleteSubject,
    optimisticToggleHoliday: academic.optimisticToggleHoliday,
  });
  const {
    handleLog, handleUndo, handleToggleHoliday, handleDeleteSubject,
    handleApplyOverride, handleResetSemester
  } = firestoreActions;

  // Holiday tactile palm tree bounce worklet
  const holidayScale = useSharedValue(1);
  const holidayIconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: holidayScale.value }],
  }));

  const handleHolidayPress = useCallback(() => {
    holidayScale.value = withSequence(
      withTiming(1.28, { duration: 120 }),
      withTiming(1.0, { duration: 140 })
    );
    handleToggleHoliday(isSelectedHoliday);
  }, [handleToggleHoliday, isSelectedHoliday]);

  const handleAddSubject = () => {
    setIsTimetableOpen(false);
    setTimeout(() => {
      setEditSubject(null);
      setShowAddModal(true);
    }, 120);
  };

  const handleEditSubject = useCallback((subject: AttendanceSubject) => {
    setIsTimetableOpen(false);
    setTimeout(() => {
      setEditSubject(subject);
      setShowAddModal(true);
    }, 120);
  }, []);

  const renderItem = useCallback(({ item: session }: { item: any }) => {
    const { subject, type, idx } = session;
    const cleanSelDate = (selectedDate || '').slice(0, 10);

    let log: any = null;

    if (session.isExtra && session.existingLogId) {
      // Extra class: look up by the log's own ID (stored on the session object)
      log = data.selectedDateLogsBySlot.get(session.existingLogId) ?? null;
    } else {
      const slotKey = `${subject.id || subject.name}_${type === 'lab' ? 'lab' : 'class'}_${idx}`;
      // Fast path: direct O(1) Map lookup
      log = data.selectedDateLogsBySlot.get(slotKey) ?? null;

      // Legacy fallback: positional match for old logs without idx field
      if (!log) {
        const subLogs = (subject.id ? logsBySubjectId[subject.id] : null) || (subject.name ? logsBySubjectId[subject.name] : null) || [];
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
    }

    return (
      <AttendanceSessionRow
        session={session}
        sessionIndex={idx}
        log={log}
        colors={colors}
        isDark={isDark}
        styles={styles}
        onUndo={handleUndo}
        onLog={handleLog}
      />
    );
  }, [data.selectedDateLogsBySlot, logsBySubjectId, selectedDate, colors, isDark, styles, handleUndo, handleLog]);

  const listHeader = useMemo(() => (
    <>
      {/* â”€â”€ Semester Overview â”€â”€ */}
      <View style={{ marginBottom: 0 }}>
        <View style={styles.overviewCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.overviewTitle}>Semester overview</Text>
            <Text style={styles.overviewStats}>{globalAttended}/{globalTotal} classes</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {globalPct !== null ? (
              <RollingNumber
                value={Math.round(globalPct)}
                suffix="%"
                style={[styles.overviewPct, { color: globalPct !== null ? (globalPct >= 75 ? colors.priorityLow : (globalPct >= 70 ? colors.priorityMed : colors.error)) : colors.textMuted }]}
              />
            ) : (
              <Text style={[styles.overviewPct, { color: colors.textMuted }]}>--%</Text>
            )}
            <ElasticProgressBar
              pct={globalPct || 0}
              color={globalPct !== null ? (globalPct >= 75 ? colors.priorityLow : (globalPct >= 70 ? colors.priorityMed : colors.error)) : colors.border}
              style={{ flex: 1 }}
              height={8}
            />
          </View>
        </View>
      </View>

      {/* â”€â”€ Warnings â”€â”€ */}
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
                  {s.name} at {pct}% â€” attend {need} more to recover
                </Text>
              );
            })}
          </View>
        </View>
      )}

      {/* â”€â”€ Swipeable Horizontal Week Strip â”€â”€ */}
      <HorizontalWeekStrip
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        holidays={holidays}
        today={today}
      />

      {/* â”€â”€ Daily Schedule â”€â”€ */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, marginTop: 4, marginBottom: 10 }}>
        <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>TODAY'S CLASSES</Text>
        <TouchableOpacity onPress={() => setIsExtraOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 12, color: colors.accentPrimary || '#38BDF8', fontWeight: '600' }}>Extra class +</Text>
        </TouchableOpacity>
      </View>
    </>
  ), [globalAttended, globalTotal, globalPct, warningSubjects, selectedDate, holidays, today, colors, isDark, styles, setDismissedWarnings]);

  const listFooter = useMemo(() => {
    // Fix #11: Show ALL enrolled subjects, not just today's scheduled ones.
    // On weekends/holidays, todayScheduledSubjects is empty, causing the
    // "BY SUBJECT" section to vanish entirely. Students need to see their
    // overall attendance stats regardless of the day.
    if (subjects.length === 0) return null;
    return (
      <View style={{ marginTop: 20, marginBottom: 56 }}>
        <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, paddingHorizontal: 2 }}>BY SUBJECT</Text>
        {subjects.map((subject, index) => (
          <SubjectSummaryRow
            key={subject.id}
            subject={subject}
            index={index}
            colors={colors}
            isDark={isDark}
            styles={styles}
            onSelect={setSelectedHistorySubject}
            onLongPress={setContextMenuSubject}
          />
        ))}
      </View>
    );
  }, [subjects, colors, isDark, styles, setSelectedHistorySubject]);

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

        {/* â”€â”€ Single Sticky Header (Absolute below status bar, 100% Transparent Background, Morphs to Glass Pills on scroll) â”€â”€ */}
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

              {/* Unlogged / Pending Classes & Labs Drawer Trigger */}
              <TactileHeaderBtn
                onPress={() => setIsUnloggedOpen(true)}
                style={styles.morphBtn}
                haptic="medium"
              >
                <View style={styles.morphBtnIconWrap}>
                  <Animated.View
                    style={[
                      styles.morphBtnPill,
                      unloggedCount > 0 && styles.morphBtnPillUnlogged,
                      { opacity: pillAnim },
                    ]}
                  />
                  {unloggedCount > 0 && (
                    <View style={styles.morphBtnBadge}>
                      <Text style={styles.morphBtnBadgeText}>
                        {unloggedCount > 99 ? '99+' : unloggedCount}
                      </Text>
                    </View>
                  )}
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={unloggedCount > 0 ? (isDark ? '#F87171' : '#DC2626') : colors.textMuted}
                  />
                </View>
                <Text style={[styles.headerBtnText, unloggedCount > 0 && { color: isDark ? '#F87171' : '#DC2626' }]}>
                  Due
                </Text>
              </TactileHeaderBtn>

              {/* Holiday Toggle */}
              <TactileHeaderBtn
                onPress={handleHolidayPress}
                style={styles.morphBtn}
                haptic="medium"
              >
                <View style={styles.morphBtnIconWrap}>
                  <Animated.View style={[styles.morphBtnPill, isSelectedHoliday && styles.morphBtnPillHoliday, { opacity: pillAnim }]} />
                  <Reanimated.View style={holidayIconAnimStyle}>
                    <Ionicons
                      name={isSelectedHoliday ? 'sunny' : 'sunny-outline'}
                      size={16}
                      color={isSelectedHoliday ? (isDark ? '#fbbf24' : '#D97706') : colors.textSecondary}
                    />
                  </Reanimated.View>
                </View>
                <Text style={[styles.headerBtnText, isSelectedHoliday && { color: isDark ? '#fbbf24' : '#D97706' }]}>Holiday</Text>
              </TactileHeaderBtn>

              {/* Alerts Button */}
              <TactileHeaderBtn
                onPress={() => setShowClassNotifModal(true)}
                style={styles.morphBtn}
                haptic="medium"
              >
                <View style={styles.morphBtnIconWrap}>
                  <Animated.View style={[styles.morphBtnPill, styles.morphBtnPillAccent, { opacity: pillAnim }]} />
                  <Ionicons name="notifications-outline" size={16} color={colors.accentPrimary} />
                </View>
                <Text style={[styles.headerBtnText, { color: colors.accentPrimary }]}>Alerts</Text>
              </TactileHeaderBtn>

              {/* Setup Button */}
              <TactileHeaderBtn
                onPress={() => setIsTimetableOpen(true)}
                style={styles.morphBtn}
                haptic="medium"
              >
                <View style={styles.morphBtnIconWrap}>
                  <Animated.View style={[styles.morphBtnPill, { opacity: pillAnim }]} />
                  <Ionicons name="settings-outline" size={16} color={colors.textMuted} />
                </View>
                <Text style={styles.headerBtnText}>Setup</Text>
              </TactileHeaderBtn>
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

        {!attendanceReady && (!subjects || subjects.length === 0) ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 5, paddingBottom: 120, paddingTop: insets.top + 54 }}
          >
            <AttendanceSkeleton />
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={isSelectedHoliday ? [] : todayFlatSessions}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={false}
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
                Animated.timing(pillAnim, { toValue: 0, duration: 80, useNativeDriver: true }).start();
              }
            }}
            onMomentumScrollEnd={(e: any) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              if (y <= 30) {
                setTabBarVisible(true);
              }
              if (y <= 20 && isPillVisibleRef.current) {
                isPillVisibleRef.current = false;
                Animated.timing(pillAnim, { toValue: 0, duration: 80, useNativeDriver: true }).start();
              }
            }}
            scrollEventThrottle={32}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <Reanimated.View
              entering={FadeIn.duration(240).easing(Easing.bezier(0.16, 1, 0.3, 1))}
              exiting={FadeOut.duration(160)}
            >
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
            </Reanimated.View>
          }
          renderItem={renderItem}
          ListFooterComponent={listFooter}
        />
      )}

      {/* â”€â”€ Lazy Loaded Modals â”€â”€ */}
      <Suspense fallback={null}>
        {/* Timetable Modal */}
        <TimetableModal
          visible={isTimetableOpen}
          onClose={() => setIsTimetableOpen(false)}
          subjects={subjects}
          handleAddSubject={handleAddSubject}
          onEditSubject={handleEditSubject}
          handleDeleteSubject={handleDeleteSubject}
          handleResetSemester={handleResetSemester}
        />

        {/* History Modal */}
        <SubjectHistoryModal
          visible={!!selectedHistorySubject}
          subject={selectedHistorySubject}
          logs={logs}
          subjects={subjects}
          colors={colors}
          isDark={isDark}
          styles={styles}
          onClose={() => setSelectedHistorySubject(null)}
          onUndo={handleUndo}
        />

        {/* Add Subject Modal */}
        <AddSubjectModal 
          visible={showAddModal} 
          onClose={() => setShowAddModal(false)} 
          existingSubject={editSubject} 
        />

        {/* Class Notification Preferences Modal */}
        <ClassNotifSettingsModal
          visible={showClassNotifModal}
          onClose={() => setShowClassNotifModal(false)}
        />

        {/* WhatsApp-Grade Floating Action Context Menu for Subjects */}
        <SubjectContextMenuModal
          visible={!!contextMenuSubject}
          subject={contextMenuSubject}
          onClose={() => setContextMenuSubject(null)}
          onQuickLogExtra={(subj) => {
            setContextMenuSubject(null);
            setTimeout(() => {
              setExtraSubjectId(subj.id);
              setIsExtraOpen(true);
            }, 100);
          }}
          onViewHistory={(subj) => {
            setContextMenuSubject(null);
            setTimeout(() => {
              setSelectedHistorySubject(subj);
            }, 100);
          }}
          onEditSubject={(subj) => {
            setContextMenuSubject(null);
            handleEditSubject(subj);
          }}
          onResetSubject={(subj) => {
            Alert.alert(
              'Reset Attendance',
              `Are you sure you want to reset attendance for "${subj.name}"? This will set attended and total counts to 0.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reset',
                  style: 'destructive',
                  onPress: () => {
                    academic.optimisticUpdateAttendance(subj.id, {
                      classesAttended: 0,
                      classesTotal: 0,
                      labsAttended: 0,
                      labsTotal: 0,
                    });
                  },
                },
              ]
            );
          }}
        />
      </Suspense>

      {/* Unlogged / Pending Classes & Labs Drawer */}
      <BottomSheet visible={isUnloggedOpen} onClose={() => setIsUnloggedOpen(false)} avoidKeyboard={false}>
        <View style={{ width: '100%', maxHeight: 480 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.sheetTitle}>Unlogged Classes & Labs</Text>
              <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
                {unloggedSessions.length} {unloggedSessions.length === 1 ? 'past session' : 'past sessions'} pending • Newest first
              </Text>
            </View>
            <TouchableOpacity onPress={() => setIsUnloggedOpen(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {unloggedSessions.length === 0 ? (
            <Reanimated.View
              entering={FadeIn.duration(220).easing(Easing.bezier(0.16, 1, 0.3, 1))}
              style={{ paddingVertical: 36, alignItems: 'center', gap: 10 }}
            >
              <Ionicons name="checkmark-done-circle-outline" size={48} color={isDark ? '#34D399' : '#059669'} />
              <Text style={{ fontSize: 16, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>
                All Caught Up! 🎉
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 20 }}>
                No unlogged classes or labs found in the past 30 days. Everything is up to date.
              </Text>
            </Reanimated.View>
          ) : (
            <ScrollView style={{ marginTop: 12, marginBottom: 8 }} showsVerticalScrollIndicator={false}>
              {unloggedSessions.map(item => (
                <UnloggedSessionRow
                  key={item.id}
                  item={item}
                  colors={colors}
                  isDark={isDark}
                  styles={styles}
                  onSelectDate={date => {
                    setSelectedDate(date);
                    setIsUnloggedOpen(false);
                  }}
                  onLog={handleLog}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </BottomSheet>

      {/* Extra Class Modal */}
      <BottomSheet visible={isExtraOpen} onClose={() => setIsExtraOpen(false)} avoidKeyboard={false}>
          <View style={{ width: '100%' }}>
            <Text style={[styles.sheetTitle, { marginBottom: 16 }]}>Log Extra Class</Text>

            {/* Subject selector â€” vertical full-width pills */}
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

            {/* Action rows â€” CLASS and LAB */}
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
      


      </View>
    </View>
  );
}
