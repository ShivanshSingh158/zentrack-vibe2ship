/**
 * TaskContextMenuModal.tsx — ZenTrack Mobile
 *
 * Authentic Apple iOS-Grade Context Menu for Tasks.
 * Pops up on task row long-press with frosted backdrop blur, elevated preview card,
 * and silky-smooth bloom transition (no bouncy rubber-band animations).
 */

import React, { useCallback } from 'react';
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
import { Task } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, SHADOW } from '../../theme/tokens';
import { formatDateShort } from '../../utils/dateUtils';

interface TaskContextMenuModalProps {
  visible: boolean;
  task: Task | null;
  onClose: () => void;
  onToggleComplete: (task: Task) => void;
  onReschedule: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const getTagColor = (tag: string, colors: any) => {
  const cleanTag = tag.toLowerCase().replace(/^#/, '').trim();
  const map: Record<string, string> = {
    high: colors.error,
    work: colors.accentBlue,
    personal: colors.accentGreen,
    errand: colors.accentAmber,
    gym: colors.accentPrimary,
    college: '#a599ff',
    finance: '#5eda9e',
    placement: '#ff9f4d',
  };
  return map[cleanTag] || colors.textTertiary;
};

// ── Authentic iOS Menu Row Item ──────────────────────────────────────────────
interface IOSMenuItemProps {
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  isDestructive?: boolean;
  onPress: () => void;
  showDivider?: boolean;
  colors: any;
  isDark: boolean;
}

function IOSMenuItem({
  label,
  iconName,
  iconColor,
  isDestructive = false,
  onPress,
  showDivider = true,
  colors,
  isDark,
}: IOSMenuItemProps) {
  const handlePress = useCallback(() => {
    if (isDestructive) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.selectionAsync();
    }
    onPress();
  }, [isDestructive, onPress]);

  return (
    <>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.actionItem,
          pressed && {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          },
        ]}
      >
        <Text
          style={[
            styles.actionText,
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

// iOS Bloom Curves: smooth cubic bezier deceleration, zero overshoot/bounce
const enterBloom = FadeIn.duration(200).easing(Easing.bezier(0.16, 1, 0.3, 1));
const exitBloom = FadeOut.duration(150).easing(Easing.out(Easing.quad));

export const TaskContextMenuModal = React.memo(function TaskContextMenuModal({
  visible,
  task,
  onClose,
  onToggleComplete,
  onReschedule,
  onEdit,
  onDelete,
}: TaskContextMenuModalProps) {
  const { colors, isDark } = useTheme();

  if (!task || !visible) return null;

  const isDone = task.status === 'completed';

  const priorityColor =
    task.priority === 'high' || task.priority === 'P1'
      ? '#FF453A'
      : task.priority === 'medium' || task.priority === 'P2'
      ? '#FF9F0A'
      : '#30D158';

  const taskTags = task.tags && task.tags.length > 0 ? task.tags : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
          onPress={onClose}
        />

        <Animated.View
          entering={enterBloom}
          exiting={exitBloom}
          style={styles.container}
        >
          {/* ── Elevated Task Preview Card ── */}
          <View
            style={[
              styles.previewCard,
              {
                backgroundColor: isDark ? 'rgba(24, 24, 28, 0.94)' : 'rgba(255, 255, 255, 0.96)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
              },
            ]}
          >
            <View style={styles.previewHeader}>
              <View style={styles.headerPills}>
                <View
                  style={[
                    styles.priorityPill,
                    { backgroundColor: priorityColor + '20', borderColor: priorityColor + '40' },
                  ]}
                >
                  <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
                  <Text style={[styles.priorityText, { color: priorityColor }]}>
                    {task.priority ? task.priority.toUpperCase() : 'NORMAL'}
                  </Text>
                </View>

                {taskTags && taskTags.slice(0, 2).map(tag => {
                  const displayTag = tag.startsWith('#') ? tag : `#${tag}`;
                  const tagColor = getTagColor(tag, colors);
                  return (
                    <View
                      key={tag}
                      style={[styles.tagPill, { backgroundColor: tagColor + '18' }]}
                    >
                      <Text style={[styles.tagPillText, { color: tagColor }]}>{displayTag}</Text>
                    </View>
                  );
                })}
              </View>

              {task.date && (
                <Text style={[styles.previewDate, { color: colors.textTertiary }]}>
                  {formatDateShort(task.date)}
                </Text>
              )}
            </View>

            <Text
              style={[
                styles.previewTitle,
                { color: colors.textPrimary },
                isDone && { textDecorationLine: 'line-through', opacity: 0.6 },
              ]}
              numberOfLines={2}
            >
              {task.title}
            </Text>

            {task.timeSlot ? (
              <View style={styles.previewTimeRow}>
                <Ionicons name="time-outline" size={13} color={colors.accentPrimary} />
                <Text style={[styles.previewTimeText, { color: colors.accentPrimary }]}>
                  {task.timeSlot}
                </Text>
              </View>
            ) : null}
          </View>

          {/* ── Apple iOS Context Menu Tray ── */}
          <View
            style={[
              styles.actionMenu,
              {
                backgroundColor: isDark ? 'rgba(28, 28, 34, 0.94)' : 'rgba(255, 255, 255, 0.96)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)',
              },
            ]}
          >
            {/* 1. Toggle Complete */}
            <IOSMenuItem
              label={isDone ? 'Mark as Pending' : 'Mark as Done'}
              iconName={isDone ? 'reload-outline' : 'checkmark-circle-outline'}
              iconColor={isDone ? colors.accentPrimary : colors.accentGreen}
              onPress={() => {
                onClose();
                onToggleComplete(task);
              }}
              colors={colors}
              isDark={isDark}
            />

            {/* 2. Reschedule */}
            <IOSMenuItem
              label="Reschedule"
              iconName="calendar-outline"
              iconColor={colors.accentPrimary}
              onPress={() => {
                onClose();
                setTimeout(() => onReschedule(task), 120);
              }}
              colors={colors}
              isDark={isDark}
            />

            {/* 3. Edit Details */}
            <IOSMenuItem
              label="Edit Details"
              iconName="create-outline"
              iconColor={isDark ? '#38BDF8' : '#0284C7'}
              onPress={() => {
                onClose();
                setTimeout(() => onEdit(task), 120);
              }}
              colors={colors}
              isDark={isDark}
            />

            {/* 4. Delete Task */}
            <IOSMenuItem
              label="Delete Task"
              iconName="trash-outline"
              isDestructive
              showDivider={false}
              onPress={() => {
                onClose();
                setTimeout(() => onDelete(task), 80);
              }}
              colors={colors}
              isDark={isDark}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
});

export default TaskContextMenuModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  container: {
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
    gap: 12,
  },
  previewCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    ...SHADOW.lg,
    shadowColor: '#a599ff',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 0.5,
  },
  tagPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagPillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
  },
  previewDate: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
  },
  previewTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.bold,
    lineHeight: 22,
  },
  previewTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  previewTimeText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
  },
  actionMenu: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    ...SHADOW.lg,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  actionText: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.medium,
    letterSpacing: -0.2,
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
});
