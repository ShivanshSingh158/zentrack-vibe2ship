/**
 * BatchActionBar.tsx — ZenTrack Mobile
 *
 * Floating bottom action bar for multi-item selection in the Cloud Vault.
 * Provides Select All, Move (N), Delete (N), and Dismiss controls.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';

interface BatchActionBarProps {
  visible: boolean;
  selectedCount: number;
  totalCount: number;
  onToggleSelectAll: () => void;
  onBatchMove: () => void;
  onBatchDelete: () => void;
  onCancel: () => void;
  colors: any;
  isDark: boolean;
}

export const BatchActionBar = React.memo(function BatchActionBar({
  visible,
  selectedCount,
  totalCount,
  onToggleSelectAll,
  onBatchMove,
  onBatchDelete,
  onCancel,
  colors,
  isDark,
}: BatchActionBarProps) {
  if (!visible) return null;

  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <View
      style={[
        styles.barContainer,
        {
          backgroundColor: isDark ? '#141416' : '#FFFFFF',
          borderColor: colors.border,
        },
      ]}
    >
      {/* Selection count badge & Select All */}
      <View style={styles.leftSection}>
        <View style={[styles.countBadge, { backgroundColor: colors.accentPrimary }]}>
          <Text style={[styles.countText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
            {selectedCount}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            feedback.tap();
            onToggleSelectAll();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.actionBtnText, { color: colors.accentPrimary }]}>
            {isAllSelected ? 'Deselect All' : 'Select All'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action Buttons */}
      <View style={styles.rightSection}>
        {/* Move */}
        <TouchableOpacity
          disabled={selectedCount === 0}
          style={[
            styles.iconBtn,
            {
              backgroundColor: isDark ? '#1C1C1E' : '#F0EFF7',
              opacity: selectedCount === 0 ? 0.4 : 1,
            },
          ]}
          onPress={() => {
            feedback.tap();
            onBatchMove();
          }}
        >
          <Ionicons name="move" size={18} color={isDark ? '#0A84FF' : '#0284C7'} />
        </TouchableOpacity>

        {/* Delete */}
        <TouchableOpacity
          disabled={selectedCount === 0}
          style={[
            styles.iconBtn,
            {
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.10)',
              opacity: selectedCount === 0 ? 0.4 : 1,
            },
          ]}
          onPress={() => {
            feedback.tap();
            onBatchDelete();
          }}
        >
          <Ionicons name="trash" size={18} color={isDark ? '#ef4444' : '#DC2626'} />
        </TouchableOpacity>

        {/* Exit / Done */}
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: isDark ? '#27272A' : '#E2E1EA' }]}
          onPress={() => {
            feedback.tap();
            onCancel();
          }}
        >
          <Ionicons name="close" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  barContainer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    ...SHADOW.md,
    zIndex: 50,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  countText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
  },
  actionBtn: {
    paddingVertical: 4,
  },
  actionBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BatchActionBar;
