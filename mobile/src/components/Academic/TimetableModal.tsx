import React, { useMemo, useCallback } from 'react';
import { View, Text, Modal, FlatList, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import Reanimated, {
  LinearTransition,
  FadeInDown,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { FONT_FAMILY } from '../../theme/tokens';
import { AttendanceSubject as Subject } from '../../contexts/MobileDataContext';
import { useTheme } from "../../contexts/ThemeContext";
import { DAY_SHORT } from '../../screens/attendance/attendanceConstants';

// ── Apple iOS-Grade Tactile Spring Scale Button ──────────────────────────────
const SpringScaleButton = React.memo(function SpringScaleButton({
  onPress,
  children,
  style,
  containerStyle,
  haptic = 'light',
  activeScale = 0.96,
}: {
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
  containerStyle?: any;
  haptic?: 'light' | 'medium';
  activeScale?: number;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(activeScale, { duration: 70 });
  }, [activeScale, scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1.0, { duration: 110 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (haptic === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.selectionAsync();
    }
    onPress();
  }, [haptic, onPress]);

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={containerStyle}
    >
      <Reanimated.View style={[style, animStyle]}>
        {children}
      </Reanimated.View>
    </Pressable>
  );
});

// ── Apple iOS-Grade Tactile Icon Button ──────────────────────────────────────
const SpringIconButton = React.memo(function SpringIconButton({
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
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.92, { duration: 70 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1.0, { duration: 110 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (haptic === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.selectionAsync();
    }
    onPress();
  }, [haptic, onPress]);

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Reanimated.View style={[style, animStyle]}>
        {children}
      </Reanimated.View>
    </Pressable>
  );
});

// ── Structured Apple iOS-Grade Timetable Subject Card ────────────────────────
const TimetableSubjectRow = React.memo(function TimetableSubjectRow({
  s,
  styles,
  colors,
  onEdit,
  onDelete,
}: {
  s: Subject;
  styles: any;
  colors: any;
  isDark: boolean;
  onEdit: (subject: Subject) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const target = s.targetPercentage || 75;

  // Schedule badges
  const scheduleItems: React.ReactNode[] = [];
  ['1', '2', '3', '4', '5', '6'].forEach(dKey => {
    const dayIdx = Number(dKey);
    const dSched = s.schedule?.[dKey] || s.schedule?.[dayIdx];
    const classes = Array.isArray(dSched?.classes) ? dSched.classes : [];
    const labs = Array.isArray(dSched?.labs) ? dSched.labs : [];
    const cCount = classes.length || (typeof dSched?.classCount === 'number' ? dSched.classCount : 0);
    const lCount = labs.length || (typeof dSched?.labCount === 'number' ? dSched.labCount : 0);
    const hasItems = cCount > 0 || lCount > 0;

    if (!hasItems) return;

    const parts: string[] = [];
    if (cCount > 0) parts.push(`${cCount}C`);
    if (lCount > 0) parts.push(`${lCount}L`);

    scheduleItems.push(
      <View key={dKey} style={styles.dayBadge}>
        <Text style={styles.dayName}>{DAY_SHORT[dayIdx]}:</Text>
        <Text style={styles.dayVal}>{parts.join(' ')}</Text>
      </View>
    );
  });

  return (
    <Reanimated.View
      layout={LinearTransition.springify().damping(22).stiffness(200)}
      entering={FadeInDown.springify().damping(20).stiffness(200)}
      exiting={FadeOut.duration(180)}
      style={styles.subjectCard}
    >
      {/* ── Top Row: Full Subject Name + Target Pill + Edit/Delete Actions ── */}
      <View style={styles.cardHeader}>
        <View style={styles.titleCol}>
          <Text style={styles.subjectTitle} numberOfLines={2}>
            {s.name}
          </Text>
          <View style={styles.targetPill}>
            <Ionicons name="locate-outline" size={11} color={colors.textSecondary || colors.textMuted} />
            <Text style={styles.targetPillText}>Target: {target}%</Text>
          </View>
        </View>

        <View style={styles.cardIconActions}>
          <SpringIconButton
            onPress={() => onEdit(s)}
            style={styles.iconActionBtn}
            haptic="light"
          >
            <Ionicons name="pencil-outline" size={14} color={colors.textSecondary || colors.textMuted} />
          </SpringIconButton>
          <SpringIconButton
            onPress={() => onDelete(s.id!, s.name)}
            style={[styles.iconActionBtn, styles.deleteBtn]}
            haptic="medium"
          >
            <Ionicons name="trash-outline" size={14} color={colors.error || '#FF453A'} />
          </SpringIconButton>
        </View>
      </View>

      {/* ── Weekly Schedule Strip (Single Line with Horizontal Scroll) ── */}
      <View style={styles.scheduleStrip}>
        <View style={styles.scheduleAnchor}>
          <Ionicons name="calendar-outline" size={13} color={colors.accentPrimary || '#A599FF'} />
          <Text style={styles.scheduleAnchorText}>Weekly:</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scheduleScrollContent}
        >
          {scheduleItems.length > 0 ? (
            scheduleItems
          ) : (
            <Text style={styles.noSchedText}>No classes scheduled</Text>
          )}
        </ScrollView>
      </View>
    </Reanimated.View>
  );
});

interface TimetableModalProps {
  visible: boolean;
  onClose: () => void;
  subjects: Subject[];
  handleAddSubject: () => void;
  onEditSubject: (subject: Subject) => void;
  handleDeleteSubject: (id: string, name: string) => void;
  handleResetSemester: () => void;
}

export const TimetableModal = React.memo(({
  visible,
  onClose,
  subjects,
  handleAddSubject,
  onEditSubject,
  handleDeleteSubject,
  handleResetSemester,
}: TimetableModalProps) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalBg}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={25} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        )}
        <Reanimated.View
          entering={SlideInDown.duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          exiting={SlideOutDown.duration(200).easing(Easing.in(Easing.quad))}
          style={styles.sheetContainer}
        >
          <SafeAreaView style={styles.modalRoot} edges={['top']}>
            {/* Apple iOS Clean Navigation Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleGroup}>
                <Text style={styles.headerTitle}>Timetable</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'}</Text>
                </View>
              </View>

          <View style={styles.headerActions}>
            <SpringScaleButton
              onPress={handleAddSubject}
              style={styles.addBtn}
              haptic="light"
            >
              <Ionicons name="add" size={16} color={isDark ? "#000000" : "#FFFFFF"} />
              <Text style={styles.addBtnText}>Add</Text>
            </SpringScaleButton>

            <SpringIconButton
              onPress={onClose}
              style={styles.closeBtn}
              haptic="light"
            >
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </SpringIconButton>
          </View>
        </View>

        {/* Subjects List with Refined Apple iOS Layout */}
        <FlatList
          data={subjects}
          keyExtractor={s => s.id!}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 20) + 24 }
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: s }) => (
            <TimetableSubjectRow
              key={s.id}
              s={s}
              styles={styles}
              colors={colors}
              isDark={isDark}
              onEdit={onEditSubject}
              onDelete={handleDeleteSubject}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="calendar-outline" size={32} color={colors.accentPrimary} />
              </View>
              <Text style={styles.emptyTitle}>No Subjects Configured</Text>
              <Text style={styles.emptySubtitle}>Tap the "+ Add" button above to set up your weekly classes, labs, and attendance targets.</Text>
            </View>
          }
          ListFooterComponent={
            subjects.length > 0 ? (
              <View style={styles.footerRow}>
                <SpringScaleButton
                  onPress={handleResetSemester}
                  containerStyle={{ width: '100%' }}
                  style={styles.resetBtn}
                  haptic="medium"
                >
                  <Ionicons name="refresh-outline" size={16} color="#FF453A" style={{ backgroundColor: 'transparent' }} />
                  <Text style={styles.resetBtnText}>Reset Semester Attendance</Text>
                </SpringScaleButton>
              </View>
            ) : null
          }
        />
          </SafeAreaView>
        </Reanimated.View>
      </View>
    </Modal>
  );
});

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.4)',
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: isDark ? '#000000' : (colors.background || '#F8F9FA'),
  },
  modalRoot: {
    flex: 1,
    backgroundColor: isDark ? '#000000' : (colors.background || '#F8F9FA'),
  },

  // ── Header Bar ────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? '#1c1c20' : 'rgba(0, 0, 0, 0.08)',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 22,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  countBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.12)' : 'rgba(108, 92, 231, 0.08)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165, 153, 255, 0.22)' : 'rgba(108, 92, 231, 0.18)',
  },
  countBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.accentPrimary || '#A599FF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accentPrimary || '#A599FF',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: colors.accentPrimary || '#A599FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.35 : 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  addBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: isDark ? '#000000' : '#FFFFFF',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : 'rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── List & Subject Card ───────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  subjectCard: {
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : 'rgba(0, 0, 0, 0.06)',
    gap: 12,
  },

  // ── Card Header Row ───────────────────────────────────────────────────────
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleCol: {
    flex: 1,
    gap: 6,
  },
  subjectTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 17,
    color: colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  targetPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7.5,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: isDark ? '#0d0d10' : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : '#E2E8F0',
  },
  targetPillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: colors.textSecondary || colors.textMuted,
  },

  // ── Header Right: Actions ─────────────────────────────────────────────────
  cardIconActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    paddingTop: 2,
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: isDark ? '#0d0d10' : 'rgba(0, 0, 0, 0.04)',
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : 'rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    backgroundColor: isDark ? 'rgba(255, 69, 58, 0.08)' : 'rgba(239, 68, 68, 0.08)',
    borderColor: isDark ? 'rgba(255, 69, 58, 0.22)' : 'rgba(239, 68, 68, 0.20)',
  },

  // ── Weekly Schedule Strip (Single Horizontal Line) ────────────────────────
  scheduleStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: isDark ? '#1c1c20' : 'rgba(0, 0, 0, 0.06)',
  },
  scheduleAnchor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  scheduleAnchorText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11.5,
    color: colors.textSecondary || colors.textMuted,
  },
  scheduleScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  },
  dayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    backgroundColor: isDark ? '#0d0d10' : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : '#E2E8F0',
  },
  dayName: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: colors.textSecondary || colors.textMuted,
  },
  dayVal: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.textPrimary,
  },
  noSchedText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 11,
    color: colors.textTertiary || colors.textMuted,
    fontStyle: 'italic',
  },

  // ── Footer: Reset Semester Action ─────────────────────────────────────────
  footerRow: {
    width: '100%',
    marginTop: 18,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: isDark ? '#221315' : '#FEF2F2',
    borderColor: isDark ? '#4A1D20' : '#FECACA',
  },
  resetBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: '#FF453A',
    letterSpacing: -0.1,
    backgroundColor: 'transparent',
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
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.10)' : 'rgba(108, 92, 231, 0.08)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165, 153, 255, 0.20)' : 'rgba(108, 92, 231, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    color: colors.textSecondary || colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
