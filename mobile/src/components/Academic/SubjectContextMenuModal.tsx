/**
 * SubjectContextMenuModal.tsx — ZenTrack Mobile
 *
 * Authentic Apple iOS-Grade Context Menu for Academic Subjects.
 * Pops up on subject row long-press with native BlurView frosted backdrop,
 * elevated Obsidian preview card, and Apple UIMenu action tray with hairline dividers.
 */

import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { AttendanceSubject } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, SHADOW } from '../../theme/tokens';
import { calculateStatus } from '../../screens/attendance/attendanceConstants';
import { calculateBunkMath } from '../../utils/academicMath';

interface SubjectContextMenuModalProps {
  visible: boolean;
  subject: AttendanceSubject | null;
  onClose: () => void;
  onQuickLogExtra: (subject: AttendanceSubject) => void;
  onViewHistory: (subject: AttendanceSubject) => void;
  onEditSubject: (subject: AttendanceSubject) => void;
  onResetSubject: (subject: AttendanceSubject) => void;
}

// ── Apple UIMenu Action Row ──────────────────────────────────────────────────
function MenuActionRow({
  iconName,
  label,
  onPress,
  isDestructive = false,
  iconColor,
  showDivider = true,
  colors,
  isDark,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  isDestructive?: boolean;
  iconColor?: string;
  showDivider?: boolean;
  colors: any;
  isDark: boolean;
}) {
  const [pressed, setPressed] = useState(false);

  const handlePressIn = () => setPressed(true);
  const handlePressOut = () => setPressed(false);

  const handlePress = () => {
    if (isDestructive) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      Haptics.selectionAsync();
    }
    onPress();
  };

  return (
    <>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={[
          styles.actionRow,
          pressed && {
            backgroundColor: isDark
              ? 'rgba(255, 255, 255, 0.08)'
              : 'rgba(0, 0, 0, 0.05)',
          },
        ]}
      >
        <Text
          style={[
            styles.actionLabel,
            { color: isDestructive ? '#FF453A' : colors.textPrimary },
            isDestructive && { fontFamily: FONT_FAMILY.bold },
          ]}
        >
          {label}
        </Text>
        <Ionicons
          name={iconName}
          size={19}
          color={isDestructive ? '#FF453A' : (iconColor || colors.textSecondary)}
        />
      </Pressable>
      {showDivider && (
        <View
          style={[
            styles.actionDivider,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
          ]}
        />
      )}
    </>
  );
}

// Apple iOS Bloom Curves: smooth cubic bezier deceleration, zero overshoot/bounce
const enterBloom = FadeIn.duration(200).easing(Easing.bezier(0.16, 1, 0.3, 1));
const exitBloom = FadeOut.duration(150).easing(Easing.out(Easing.quad));

export const SubjectContextMenuModal = React.memo(function SubjectContextMenuModal({
  visible,
  subject,
  onClose,
  onQuickLogExtra,
  onViewHistory,
  onEditSubject,
  onResetSubject,
}: SubjectContextMenuModalProps) {
  const { colors, isDark } = useTheme();

  // Retain last non-null subject during slide-down animation so it never renders blank
  const lastSubjectRef = React.useRef<AttendanceSubject | null>(subject);
  if (subject) {
    lastSubjectRef.current = subject;
  }
  const currentSubject = subject || lastSubjectRef.current;

  const [activeVisible, setActiveVisible] = useState(visible);

  useEffect(() => {
    setActiveVisible(visible);
  }, [visible]);

  const handleGracefulClose = useCallback((action?: () => void) => {
    setActiveVisible(false);
    setTimeout(() => {
      onClose();
      action?.();
    }, 160);
  }, [onClose]);

  if (!visible && !activeVisible) return null;
  if (!currentSubject) return null;

  const totalAtt = (currentSubject.classesAttended || 0) + (currentSubject.labsAttended || 0);
  const totalCls = (currentSubject.classesTotal || 0) + (currentSubject.labsTotal || 0);
  const targetPct = currentSubject.targetPercentage || 75;
  const status = calculateStatus(totalAtt, totalCls, targetPct);
  const bunk = calculateBunkMath(totalAtt, totalCls, targetPct);

  const pct = status.pct !== null ? Math.round(status.pct) : null;
  const statusColor =
    status.urgency === 'danger'
      ? colors.priorityHigh || '#FF453A'
      : status.urgency === 'warning'
      ? colors.priorityMed || '#FF9F0A'
      : colors.priorityLow || '#30D158';

  return (
    <Modal
      visible={activeVisible}
      transparent
      animationType="none"
      onRequestClose={() => handleGracefulClose()}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Frosted Glass Blur Backdrop */}
        <BlurView
          intensity={isDark ? 35 : 20}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.25)' },
          ]}
          onPress={() => handleGracefulClose()}
        />

        {/* Apple iOS Bloom Container */}
        <Animated.View
          entering={enterBloom}
          exiting={exitBloom}
          style={styles.container}
        >
          {/* ── Elevated Subject Preview Card ── */}
          <View
            style={[
              styles.previewCard,
              {
                backgroundColor: isDark ? '#000000' : 'rgba(255, 255, 255, 0.96)',
                borderColor: isDark ? '#1c1c20' : 'rgba(0, 0, 0, 0.08)',
              },
            ]}
          >
            <View style={styles.previewHeader}>
              <View style={styles.titleCol}>
                <Text
                  style={[styles.previewTitle, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {currentSubject.name}
                </Text>
                <Text style={[styles.previewSubtext, { color: colors.textSecondary || colors.textMuted }]}>
                  {totalAtt} of {totalCls} attended • Target {targetPct}%
                </Text>
              </View>

              {pct !== null ? (
                <View
                  style={[
                    styles.pctBadge,
                    {
                      borderColor: statusColor + '40',
                      backgroundColor: statusColor + '18',
                    },
                  ]}
                >
                  <Text style={[styles.pctText, { color: statusColor }]}>{pct}%</Text>
                </View>
              ) : null}
            </View>

            {/* Bunk safety summary callout */}
            <View
              style={[
                styles.bunkSummaryRow,
                {
                  borderTopColor: isDark
                    ? '#1c1c20'
                    : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
            >
              {bunk.status === 'safe' && bunk.count > 0 ? (
                <View style={styles.bunkStatusGroup}>
                  <Ionicons name="checkmark-circle" size={14} color="#30D158" />
                  <Text style={[styles.bunkStatusText, { color: '#30D158' }]}>
                    Can safely miss {bunk.count} more {bunk.count === 1 ? 'class' : 'classes'}
                  </Text>
                </View>
              ) : bunk.status === 'warning' ? (
                <View style={styles.bunkStatusGroup}>
                  <Ionicons name="warning" size={14} color="#FF9F0A" />
                  <Text style={[styles.bunkStatusText, { color: '#FF9F0A' }]}>
                    Zero margin: attend all upcoming classes
                  </Text>
                </View>
              ) : bunk.status === 'critical' ? (
                <View style={styles.bunkStatusGroup}>
                  <Ionicons name="alert-circle" size={14} color="#FF453A" />
                  <Text style={[styles.bunkStatusText, { color: '#FF453A' }]}>
                    Need {bunk.count} consecutive {bunk.count === 1 ? 'class' : 'classes'} to reach {targetPct}%
                  </Text>
                </View>
              ) : (
                <View style={styles.bunkStatusGroup}>
                  <Ionicons name="school-outline" size={14} color={colors.textSecondary || colors.textMuted} />
                  <Text style={[styles.bunkStatusText, { color: colors.textSecondary || colors.textMuted }]}>
                    On track with curriculum schedule
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Apple UIMenu Action Tray ── */}
          <View
            style={[
              styles.actionTray,
              {
                backgroundColor: isDark ? '#000000' : 'rgba(255, 255, 255, 0.96)',
                borderColor: isDark ? '#1c1c20' : 'rgba(0, 0, 0, 0.08)',
              },
            ]}
          >
            {/* Quick Log Extra Class */}
            <MenuActionRow
              iconName="add-circle-outline"
              label="Quick Log Extra Class"
              iconColor={colors.accentPrimary || '#A599FF'}
              onPress={() => handleGracefulClose(() => onQuickLogExtra(currentSubject))}
              colors={colors}
              isDark={isDark}
            />

            {/* View Full History */}
            <MenuActionRow
              iconName="time-outline"
              label="View History & Logs"
              iconColor="#38BDF8"
              onPress={() => handleGracefulClose(() => onViewHistory(currentSubject))}
              colors={colors}
              isDark={isDark}
            />

            {/* Edit Target & Split */}
            <MenuActionRow
              iconName="options-outline"
              label="Edit Target & Schedule"
              iconColor="#FF9F0A"
              onPress={() => handleGracefulClose(() => onEditSubject(currentSubject))}
              colors={colors}
              isDark={isDark}
            />

            {/* Reset Subject Attendance */}
            <MenuActionRow
              iconName="refresh-outline"
              label="Reset Subject Attendance"
              isDestructive
              showDivider={false}
              onPress={() => handleGracefulClose(() => onResetSubject(currentSubject))}
              colors={colors}
              isDark={isDark}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  container: {
    width: '100%',
    maxWidth: 360,
    gap: 12,
  },

  // ── Preview Card ──────────────────────────────────────────────────────────
  previewCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    ...SHADOW.lg,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  previewTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 17,
    letterSpacing: -0.3,
  },
  previewSubtext: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
  },
  pctBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pctText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
  },
  bunkSummaryRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bunkStatusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bunkStatusText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
  },

  // ── Apple UIMenu Action Tray ──────────────────────────────────────────────
  actionTray: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    ...SHADOW.lg,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  actionLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 15.5,
    letterSpacing: -0.1,
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
});

export default SubjectContextMenuModal;
