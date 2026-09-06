/**
 * StorageItemActionSheet.tsx — ZenTrack Mobile
 *
 * Isolated, high-speed 3-dots action sheet for items in the Cloud Vault.
 * Features Pin/Unpin, Rename, Move, and Delete actions with haptics.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StorageNode } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';

interface StorageItemActionSheetProps {
  item: StorageNode | null;
  onClose: () => void;
  onPin: (item: StorageNode) => void;
  onRename: (item: StorageNode) => void;
  onMove: (item: StorageNode) => void;
  onDelete: (item: StorageNode) => void;
  isDark: boolean;
  colors: any;
}

export const StorageItemActionSheet = React.memo(function StorageItemActionSheet({
  item,
  onClose,
  onPin,
  onRename,
  onMove,
  onDelete,
  isDark,
  colors,
}: StorageItemActionSheetProps) {
  if (!item) return null;

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.actionSheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.actionSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.actionSheetHandle, { backgroundColor: isDark ? colors.border : '#D1D1D6' }]} />

          {/* Item Name Preview */}
          <Text style={[styles.itemHeaderTitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.name}
          </Text>

          {/* Pin / Unpin */}
          <TouchableOpacity
            style={styles.actionSheetItem}
            onPress={() => {
              feedback.tap();
              onPin(item);
              onClose();
            }}
          >
            <View
              style={[
                styles.actionSheetIcon,
                { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)' },
              ]}
            >
              <Ionicons
                name={item.pinned ? 'pin-outline' : 'pin'}
                size={20}
                color={colors.accentPrimary}
              />
            </View>
            <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>
              {item.pinned ? 'Unpin' : 'Pin to Top'}
            </Text>
          </TouchableOpacity>

          {/* Rename */}
          <TouchableOpacity
            style={styles.actionSheetItem}
            onPress={() => {
              feedback.tap();
              onRename(item);
              onClose();
            }}
          >
            <View
              style={[
                styles.actionSheetIcon,
                { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)' },
              ]}
            >
              <Ionicons name="pencil" size={20} color={colors.accentPrimary} />
            </View>
            <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>Rename</Text>
          </TouchableOpacity>

          {/* Move */}
          <TouchableOpacity
            style={styles.actionSheetItem}
            onPress={() => {
              feedback.tap();
              onMove(item);
              onClose();
            }}
          >
            <View
              style={[
                styles.actionSheetIcon,
                { backgroundColor: isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(2, 132, 199, 0.10)' },
              ]}
            >
              <Ionicons name="move" size={20} color={isDark ? '#0A84FF' : '#0284C7'} />
            </View>
            <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>Move To...</Text>
          </TouchableOpacity>

          {/* Delete */}
          <TouchableOpacity
            style={styles.actionSheetItem}
            onPress={() => {
              feedback.tap();
              onDelete(item);
              onClose();
            }}
          >
            <View
              style={[
                styles.actionSheetIcon,
                { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.10)' },
              ]}
            >
              <Ionicons name="trash" size={20} color={isDark ? '#ef4444' : '#DC2626'} />
            </View>
            <Text style={[styles.actionSheetText, { color: isDark ? '#ef4444' : '#DC2626' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingBottom: SPACE.xl,
    paddingHorizontal: SPACE.md,
    borderWidth: 1,
  },
  actionSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: SPACE.md,
  },
  itemHeaderTitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    marginBottom: SPACE.sm,
    paddingHorizontal: SPACE.xs,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md,
    gap: SPACE.md,
  },
  actionSheetIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
  },
});

export default StorageItemActionSheet;
