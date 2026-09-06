/**
 * StorageNodeRow.tsx — ZenTrack Mobile
 *
 * Ultra-performance, memoized row component for Cloud Vault items (Files, Notes, Folders).
 * Uses strict React.memo comparator to eliminate 100% of re-renders on search input or peer changes.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StorageNode } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { timeAgo } from '../../utils/dateUtils';
import { feedback } from '../../utils/haptics';
import UploadProgressRing from './UploadProgressRing';

export interface StorageNodeRowProps {
  item: StorageNode & { uploading?: boolean };
  isSelected: boolean;
  isSelectionMode: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadSize?: string;
  colors: any;
  isDark: boolean;
  onPress: (item: StorageNode) => void;
  onLongPress: (item: StorageNode) => void;
  onMenuPress: (item: StorageNode) => void;
}

const StorageNodeIcon = React.memo(function StorageNodeIcon({
  type,
  fileType,
  isDark,
  colors,
}: {
  type: string;
  fileType?: string;
  isDark: boolean;
  colors: any;
}) {
  let bgColor = isDark ? 'rgba(142, 142, 147, 0.15)' : 'rgba(142, 142, 147, 0.10)';
  let color = isDark ? '#8E8E93' : '#636366';
  let iconName: keyof typeof Ionicons.glyphMap = 'document';

  if (type === 'folder') {
    bgColor = isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(2, 132, 199, 0.10)';
    color = isDark ? '#0A84FF' : '#0284C7';
    iconName = 'folder';
  } else if (type === 'note') {
    bgColor = isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)';
    color = isDark ? colors.accentPrimary || '#a599ff' : '#6C5CE7';
    iconName = 'document-text';
  } else if (fileType === 'pdf') {
    bgColor = isDark ? 'rgba(255, 105, 97, 0.15)' : 'rgba(220, 38, 38, 0.10)';
    color = isDark ? '#ff6961' : '#DC2626';
    iconName = 'document';
  } else if (fileType === 'image') {
    bgColor = isDark ? 'rgba(94, 218, 158, 0.15)' : 'rgba(5, 150, 105, 0.10)';
    color = isDark ? '#5EDA9E' : '#059669';
    iconName = 'image';
  } else if (fileType === 'docx') {
    bgColor = isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(2, 132, 199, 0.10)';
    color = isDark ? '#0A84FF' : '#0284C7';
    iconName = 'document';
  }

  return (
    <View style={[styles.iconBox, { backgroundColor: bgColor }]}>
      <Ionicons name={iconName} size={24} color={color} />
    </View>
  );
});

function areRowPropsEqual(prev: StorageNodeRowProps, next: StorageNodeRowProps): boolean {
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.name !== next.item.name) return false;
  if (prev.item.pinned !== next.item.pinned) return false;
  if (prev.item.size !== next.item.size) return false;
  if (prev.item.updatedAt !== next.item.updatedAt) return false;
  if (prev.item.createdAt !== next.item.createdAt) return false;
  if (prev.item.type !== next.item.type) return false;
  if (prev.item.fileType !== next.item.fileType) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isSelectionMode !== next.isSelectionMode) return false;
  if (prev.isUploading !== next.isUploading) return false;
  if (prev.uploadProgress !== next.uploadProgress) return false;
  if (prev.uploadSize !== next.uploadSize) return false;
  if (prev.isDark !== next.isDark) return false;
  if (prev.colors !== next.colors) return false;
  return true;
}

export const StorageNodeRow = React.memo(function StorageNodeRow({
  item,
  isSelected,
  isSelectionMode,
  isUploading,
  uploadProgress = 0,
  uploadSize = '0 MB',
  colors,
  isDark,
  onPress,
  onLongPress,
  onMenuPress,
}: StorageNodeRowProps) {
  const handlePress = () => {
    if (item.uploading) return;
    feedback.tap();
    onPress(item);
  };

  const handleLongPress = () => {
    if (item.uploading) return;
    feedback.commit();
    onLongPress(item);
  };

  const handleMenuPress = () => {
    feedback.tap();
    onMenuPress(item);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[
        styles.listItem,
        {
          backgroundColor: colors.surface,
          borderColor: isSelected ? '#0A84FF' : colors.border,
        },
        isSelected && {
          backgroundColor: isDark ? 'rgba(10,132,255,0.14)' : 'rgba(2,132,199,0.08)',
        },
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      {item.uploading || isUploading ? (
        <View style={styles.iconBox}>
          <UploadProgressRing progress={uploadProgress} />
        </View>
      ) : (
        <StorageNodeIcon
          type={item.type}
          fileType={item.fileType}
          isDark={isDark}
          colors={colors}
        />
      )}

      <View style={styles.contentWrap}>
        <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.pinned && (
            <Ionicons name="pin" size={12} color={colors.accentPrimary} style={{ marginRight: 4 }} />
          )}
          {item.pinned ? ' ' : ''}
          {item.name}
        </Text>

        {item.type === 'file' && (
          <Text style={[styles.itemSubtitle, { color: colors.textMuted }]}>
            {item.uploading || isUploading
              ? `${uploadSize}, uploading ${uploadProgress}%`
              : item.size
              ? (item.size / (1024 * 1024)).toFixed(1) + ' MB'
              : 'Unknown size'}
          </Text>
        )}

        {item.type === 'note' && (
          <Text style={[styles.itemSubtitle, { color: colors.textMuted }]}>
            Note, {timeAgo(item.updatedAt || item.createdAt)}
          </Text>
        )}

        {item.type === 'folder' && (
          <Text style={[styles.itemSubtitle, { color: colors.textMuted }]}>
            Folder
          </Text>
        )}
      </View>

      {isSelectionMode ? (
        <View
          style={[
            styles.checkbox,
            {
              borderColor: isSelected ? '#0A84FF' : colors.border,
              backgroundColor: isSelected ? '#0A84FF' : 'transparent',
            },
          ]}
        >
          {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
        </View>
      ) : (
        !item.uploading &&
        !isUploading && (
          <TouchableOpacity
            onPress={handleMenuPress}
            style={styles.menuBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )
      )}
    </TouchableOpacity>
  );
}, areRowPropsEqual);

const styles = StyleSheet.create({
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACE.xs,
    marginHorizontal: SPACE.xs,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    borderWidth: 1,
    ...SHADOW.sm,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWrap: {
    flex: 1,
    paddingRight: SPACE.md,
    marginLeft: SPACE.md,
  },
  itemTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.base,
  },
  itemSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtn: {
    padding: SPACE.sm,
  },
});

export default StorageNodeRow;
