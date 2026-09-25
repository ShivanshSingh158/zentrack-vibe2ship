/**
 * SortMenuModal.tsx — ZenTrack Mobile
 *
 * Floating dropdown/popover menu for Cloud Vault & Notes sorting.
 * Compact, lightweight, iOS-grade card anchored at top-right.
 * Provides quick 1-tap sorting by Date Added, Alphabetical, and File Size,
 * plus multi-select trigger.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { feedback } from '../../utils/haptics';
import { FONT_FAMILY } from '../../theme/tokens';

export type SortMode =
  | 'newest'
  | 'oldest'
  | 'az'
  | 'za'
  | 'size_desc'
  | 'size_asc'
  | 'modified';

interface SortMenuModalProps {
  visible: boolean;
  activeSort: SortMode;
  onSelectSort: (mode: SortMode) => void;
  onClose: () => void;
  onSelectMultiple?: () => void;
  colors: any;
  isDark: boolean;
}

export default function SortMenuModal({
  visible,
  activeSort,
  onSelectSort,
  onClose,
  onSelectMultiple,
  colors,
  isDark,
}: SortMenuModalProps) {
  const insets = useSafeAreaInsets();

  const handleSelect = useCallback(
    (mode: SortMode) => {
      feedback.tap();
      onSelectSort(mode);
      onClose();
    },
    [onSelectSort, onClose]
  );

  const handleSelectMultiple = useCallback(() => {
    feedback.tap();
    onClose();
    onSelectMultiple?.();
  }, [onClose, onSelectMultiple]);

  if (!visible) return null;

  const topOffset = insets.top + (Platform.OS === 'android' ? 50 : 44);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={[styles.overlay, { paddingTop: topOffset }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={[
            styles.menuContainer,
            {
              backgroundColor: isDark ? '#141416' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
            },
          ]}
        >
          {/* ── TIME & DATE ── */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.65}
            onPress={() => handleSelect('newest')}
          >
            <Ionicons
              name="time-outline"
              size={18}
              color={activeSort === 'newest' ? colors.accentPrimary : colors.textPrimary}
              style={styles.menuIcon}
            />
            <Text
              style={[
                styles.menuItemText,
                { color: colors.textPrimary },
                activeSort === 'newest' && { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold },
              ]}
            >
              Date Added (Newest)
            </Text>
            {activeSort === 'newest' && (
              <Ionicons name="checkmark" size={16} color={colors.accentPrimary} style={styles.checkIcon} />
            )}
          </TouchableOpacity>

          <View style={[styles.menuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]} />

          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.65}
            onPress={() => handleSelect('oldest')}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={activeSort === 'oldest' ? colors.accentPrimary : colors.textPrimary}
              style={styles.menuIcon}
            />
            <Text
              style={[
                styles.menuItemText,
                { color: colors.textPrimary },
                activeSort === 'oldest' && { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold },
              ]}
            >
              Date Added (Oldest)
            </Text>
            {activeSort === 'oldest' && (
              <Ionicons name="checkmark" size={16} color={colors.accentPrimary} style={styles.checkIcon} />
            )}
          </TouchableOpacity>

          {/* ── SECTION DIVIDER ── */}
          <View style={[styles.sectionDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]} />

          {/* ── ALPHABETICAL ── */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.65}
            onPress={() => handleSelect('az')}
          >
            <Ionicons
              name="arrow-down-outline"
              size={18}
              color={activeSort === 'az' ? colors.accentPrimary : colors.textPrimary}
              style={styles.menuIcon}
            />
            <Text
              style={[
                styles.menuItemText,
                { color: colors.textPrimary },
                activeSort === 'az' && { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold },
              ]}
            >
              Name (A → Z)
            </Text>
            {activeSort === 'az' && (
              <Ionicons name="checkmark" size={16} color={colors.accentPrimary} style={styles.checkIcon} />
            )}
          </TouchableOpacity>

          <View style={[styles.menuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]} />

          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.65}
            onPress={() => handleSelect('za')}
          >
            <Ionicons
              name="arrow-up-outline"
              size={18}
              color={activeSort === 'za' ? colors.accentPrimary : colors.textPrimary}
              style={styles.menuIcon}
            />
            <Text
              style={[
                styles.menuItemText,
                { color: colors.textPrimary },
                activeSort === 'za' && { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold },
              ]}
            >
              Name (Z → A)
            </Text>
            {activeSort === 'za' && (
              <Ionicons name="checkmark" size={16} color={colors.accentPrimary} style={styles.checkIcon} />
            )}
          </TouchableOpacity>

          {/* ── SECTION DIVIDER ── */}
          <View style={[styles.sectionDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]} />

          {/* ── FILE SIZE ── */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.65}
            onPress={() => handleSelect('size_desc')}
          >
            <Ionicons
              name="file-tray-full-outline"
              size={18}
              color={activeSort === 'size_desc' ? colors.accentPrimary : colors.textPrimary}
              style={styles.menuIcon}
            />
            <Text
              style={[
                styles.menuItemText,
                { color: colors.textPrimary },
                activeSort === 'size_desc' && { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold },
              ]}
            >
              Size (Largest First)
            </Text>
            {activeSort === 'size_desc' && (
              <Ionicons name="checkmark" size={16} color={colors.accentPrimary} style={styles.checkIcon} />
            )}
          </TouchableOpacity>

          <View style={[styles.menuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]} />

          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.65}
            onPress={() => handleSelect('size_asc')}
          >
            <Ionicons
              name="file-tray-outline"
              size={18}
              color={activeSort === 'size_asc' ? colors.accentPrimary : colors.textPrimary}
              style={styles.menuIcon}
            />
            <Text
              style={[
                styles.menuItemText,
                { color: colors.textPrimary },
                activeSort === 'size_asc' && { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold },
              ]}
            >
              Size (Smallest First)
            </Text>
            {activeSort === 'size_asc' && (
              <Ionicons name="checkmark" size={16} color={colors.accentPrimary} style={styles.checkIcon} />
            )}
          </TouchableOpacity>

          {/* ── SELECT MULTIPLE ── */}
          {onSelectMultiple && (
            <>
              <View style={[styles.sectionDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]} />
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.65}
                onPress={handleSelectMultiple}
              >
                <Ionicons
                  name="checkbox-outline"
                  size={18}
                  color={colors.textPrimary}
                  style={styles.menuIcon}
                />
                <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>
                  Select Multiple
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  menuContainer: {
    width: 224,
    borderRadius: 14,
    paddingVertical: 5,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  menuIcon: {
    marginRight: 12,
  },
  menuItemText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 14,
    letterSpacing: -0.15,
  },
  checkIcon: {
    marginLeft: 'auto',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  sectionDivider: {
    height: 1,
    marginHorizontal: 10,
    marginVertical: 2,
  },
});
