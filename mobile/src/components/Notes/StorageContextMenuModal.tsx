/**
 * StorageContextMenuModal.tsx — ZenTrack Mobile
 *
 * Sleek, lightweight, floating popover options menu for Cloud Vault & Notes.
 * Anchored directly at the 3-dots button or row touch point.
 * Matches Obsidian Cosmos theme with compact rows, left-aligned icons,
 * hairline dividers, and responsive tactile haptics.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { StorageNode } from '../../contexts/MobileDataContext';
import { FONT_FAMILY } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';

export interface StorageContextMenuModalProps {
  visible: boolean;
  item: StorageNode | null;
  anchorPosition?: { x: number; y: number } | null;
  onClose: () => void;
  onPin: (item: StorageNode) => void;
  onRename: (item: StorageNode) => void;
  onMove: (item: StorageNode) => void;
  onDelete: (item: StorageNode) => void;
  onSelect?: (item: StorageNode) => void;
}

export const StorageContextMenuModal = React.memo(function StorageContextMenuModal({
  visible,
  item,
  anchorPosition,
  onClose,
  onPin,
  onRename,
  onMove,
  onDelete,
  onSelect,
}: StorageContextMenuModalProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  if (!item || !visible) return null;

  // Approximate menu height for 4 or 5 items
  const MENU_HEIGHT = onSelect ? 226 : 184;
  const minTop = insets.top + (Platform.OS === 'android' ? 50 : 44);
  const maxTop = windowHeight - insets.bottom - MENU_HEIGHT - 16;

  let calculatedTop = (windowHeight - MENU_HEIGHT) / 2;

  if (anchorPosition && anchorPosition.y > 0) {
    if (anchorPosition.y + MENU_HEIGHT > windowHeight - insets.bottom - 20) {
      // Pop upwards above the 3-dots button if near the bottom of the screen
      calculatedTop = Math.max(minTop, anchorPosition.y - MENU_HEIGHT);
    } else {
      // Pop downwards starting slightly above/at the 3-dots button
      calculatedTop = Math.max(minTop, Math.min(anchorPosition.y - 12, maxTop));
    }
  }

  const deleteLabel =
    item.type === 'folder'
      ? 'Delete Folder'
      : item.type === 'note'
      ? 'Delete Note'
      : 'Delete File';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Subtle Backdrop Dim */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.18)' },
          ]}
        />

        {/* Floating Menu Popover */}
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={[
            styles.menuContainer,
            {
              top: calculatedTop,
              right: 16,
              backgroundColor: isDark ? '#141416' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
            },
          ]}
        >
          {/* 1. Pin / Unpin */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.65}
            onPress={() => {
              feedback.tap();
              onClose();
              onPin(item);
            }}
          >
            <Ionicons
              name={item.pinned ? 'pin-outline' : 'pin'}
              size={18}
              color={colors.accentPrimary || '#A599FF'}
              style={styles.menuIcon}
            />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>
              {item.pinned ? 'Unpin from Top' : 'Pin to Top'}
            </Text>
          </TouchableOpacity>

          <View
            style={[
              styles.menuDivider,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
            ]}
          />

          {/* 2. Rename */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.65}
            onPress={() => {
              feedback.tap();
              onClose();
              onRename(item);
            }}
          >
            <Ionicons
              name="pencil-outline"
              size={18}
              color={isDark ? '#38BDF8' : '#0284C7'}
              style={styles.menuIcon}
            />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>
              Rename
            </Text>
          </TouchableOpacity>

          <View
            style={[
              styles.menuDivider,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
            ]}
          />

          {/* 3. Move To */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.65}
            onPress={() => {
              feedback.tap();
              onClose();
              onMove(item);
            }}
          >
            <Ionicons
              name="folder-outline"
              size={18}
              color={isDark ? '#FCD34D' : '#D97706'}
              style={styles.menuIcon}
            />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>
              Move To...
            </Text>
          </TouchableOpacity>

          {/* 4. Select Item (Optional) */}
          {onSelect && (
            <>
              <View
                style={[
                  styles.menuDivider,
                  { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
                ]}
              />
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.65}
                onPress={() => {
                  feedback.tap();
                  onClose();
                  onSelect(item);
                }}
              >
                <Ionicons
                  name="checkbox-outline"
                  size={18}
                  color={isDark ? '#5EDA9E' : '#059669'}
                  style={styles.menuIcon}
                />
                <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>
                  Select Item
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Section Divider Before Destructive Delete */}
          <View
            style={[
              styles.sectionDivider,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' },
            ]}
          />

          {/* 5. Destructive Delete */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.65}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onClose();
              onDelete(item);
            }}
          >
            <Ionicons
              name="trash-outline"
              size={18}
              color="#FF453A"
              style={styles.menuIcon}
            />
            <Text style={[styles.menuItemText, styles.destructiveText]}>
              {deleteLabel}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuContainer: {
    position: 'absolute',
    width: 216,
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
  destructiveText: {
    color: '#FF453A',
    fontFamily: FONT_FAMILY.bold,
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

export default StorageContextMenuModal;
