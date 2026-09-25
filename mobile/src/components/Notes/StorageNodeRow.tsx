/**
 * StorageNodeRow.tsx — ZenTrack Mobile
 *
 * Ultra-performance, memoized row component for Cloud Vault items (Files, Notes, Folders).
 * Uses strict React.memo comparator to eliminate 100% of re-renders on search input or peer changes.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated as RNAnimated } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { StorageNode } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { timeAgo } from '../../utils/dateUtils';
import { feedback } from '../../utils/haptics';
import UploadProgressRing from './UploadProgressRing';

const ROW_ENTER_ANIM = FadeInDown.duration(160);

export interface StorageNodeRowProps {
  item: StorageNode & { uploading?: boolean };
  isSelected: boolean;
  isSelectionMode: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadSize?: string;
  colors: any;
  isDark: boolean;
  compact?: boolean;
  onPress: (item: StorageNode) => void;
  onLongPress: (item: StorageNode, anchor?: { pageX: number; pageY: number }) => void;
  onMenuPress: (item: StorageNode, anchor?: { pageX: number; pageY: number }) => void;
  onPin?: (item: StorageNode) => void;
  onDelete?: (item: StorageNode) => void;
}

const StorageNodeIcon = React.memo(function StorageNodeIcon({
  type,
  fileType,
  isDark,
  colors,
  compact = false,
}: {
  type: string;
  fileType?: string;
  isDark: boolean;
  colors: any;
  compact?: boolean;
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
    <View style={[styles.iconBox, compact && styles.iconBoxCompact, { backgroundColor: bgColor }]}>
      <Ionicons name={iconName} size={compact ? 20 : 24} color={color} />
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
  if (prev.item.locationPath !== next.item.locationPath) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isSelectionMode !== next.isSelectionMode) return false;
  if (prev.isUploading !== next.isUploading) return false;
  if (prev.uploadProgress !== next.uploadProgress) return false;
  if (prev.uploadSize !== next.uploadSize) return false;
  if (prev.isDark !== next.isDark) return false;
  if (prev.colors !== next.colors) return false;
  if (prev.compact !== next.compact) return false;
  if (prev.onPin !== next.onPin) return false;
  if (prev.onDelete !== next.onDelete) return false;
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
  compact = false,
  onPress,
  onLongPress,
  onMenuPress,
  onPin,
  onDelete,
}: StorageNodeRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const rowScale = useSharedValue(1);
  const checkScale = useSharedValue(isSelected ? 1 : 0.8);

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rowScale.value }],
  }));

  const animatedCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  useEffect(() => {
    if (isSelected) {
      checkScale.value = withSequence(
        withTiming(0.90, { duration: 60 }),
        withTiming(1, { duration: 90 })
      );
    }
  }, [isSelected, checkScale]);

  const handlePressIn = () => {
    rowScale.value = withTiming(0.98, { duration: 70 });
  };

  const handlePressOut = () => {
    rowScale.value = withTiming(1, { duration: 120 });
  };

  const handlePress = () => {
    if (item.uploading) return;
    feedback.tap();
    onPress(item);
  };

  const handleLongPress = (event: any) => {
    if (item.uploading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    rowScale.value = withTiming(0.98, { duration: 60 }, () => {
      rowScale.value = withTiming(1, { duration: 100 });
    });
    const pageX = event?.nativeEvent?.pageX ?? 0;
    const pageY = event?.nativeEvent?.pageY ?? 0;
    onLongPress(item, { pageX, pageY });
  };

  const handleMenuPress = (event: any) => {
    feedback.tap();
    const pageX = event?.nativeEvent?.pageX ?? 0;
    const pageY = event?.nativeEvent?.pageY ?? 0;
    onMenuPress(item, { pageX, pageY });
  };

  // ── Swipe Right to Pin / Unpin ──
  const renderLeftActions = useCallback((progress: any) => {
    if (isSelectionMode || !onPin) return null;
    const scale = progress.interpolate({
      inputRange: [0, 0.6, 1],
      outputRange: [0.7, 0.95, 1.2],
      extrapolate: 'clamp',
    });
    return (
      <View style={styles.actionLeftContainer}>
        <TouchableOpacity
          style={[styles.actionLeft, { backgroundColor: colors.accentPrimary || '#6C5CE7' }]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            swipeableRef.current?.close();
            onPin(item);
          }}
        >
          <RNAnimated.View style={{ transform: [{ scale }] }}>
            <Ionicons name={item.pinned ? 'pin-outline' : 'pin'} size={20} color="#FFFFFF" />
          </RNAnimated.View>
        </TouchableOpacity>
      </View>
    );
  }, [colors, isSelectionMode, item, onPin]);

  // ── Swipe Left to Delete ──
  const renderRightActions = useCallback((progress: any) => {
    if (isSelectionMode || !onDelete) return null;
    const scale = progress.interpolate({
      inputRange: [0, 0.6, 1],
      outputRange: [0.7, 0.95, 1.15],
      extrapolate: 'clamp',
    });
    return (
      <View style={styles.actionRightContainer}>
        <TouchableOpacity
          style={[styles.actionRight, { backgroundColor: '#FF453A' }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            swipeableRef.current?.close();
            onDelete(item);
          }}
        >
          <RNAnimated.View style={{ transform: [{ scale }] }}>
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
          </RNAnimated.View>
        </TouchableOpacity>
      </View>
    );
  }, [isSelectionMode, item, onDelete]);

  return (
    <Animated.View
      entering={ROW_ENTER_ANIM}
      exiting={FadeOut.duration(160)}
      layout={LinearTransition.duration(180)}
      style={animatedRowStyle}
    >
      <Swipeable
        ref={swipeableRef}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        friction={2}
        overshootFriction={8}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[
            styles.listItem,
            compact && styles.listItemCompact,
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
            <View style={[styles.iconBox, compact && styles.iconBoxCompact]}>
              <UploadProgressRing progress={uploadProgress} />
            </View>
          ) : (
            <StorageNodeIcon
              type={item.type}
              fileType={item.fileType}
              isDark={isDark}
              colors={colors}
              compact={compact}
            />
          )}

          <View style={[styles.contentWrap, compact && styles.contentWrapCompact]}>
            <Text style={[styles.itemTitle, compact && styles.itemTitleCompact, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.pinned && (
                <Ionicons name="pin" size={compact ? 11 : 12} color={colors.accentPrimary} style={{ marginRight: 4 }} />
              )}
              {item.pinned ? ' ' : ''}
              {item.name}
            </Text>

            {item.type === 'file' && (
              <Text style={[styles.itemSubtitle, compact && styles.itemSubtitleCompact, { color: colors.textMuted }]} numberOfLines={1}>
                {item.locationPath ? `${item.locationPath}  •  ` : ''}
                {item.uploading || isUploading
                  ? `${uploadSize}, uploading ${uploadProgress}%`
                  : item.size
                  ? (item.size / (1024 * 1024)).toFixed(1) + ' MB'
                  : 'Unknown size'}
              </Text>
            )}

            {item.type === 'note' && (
              <Text style={[styles.itemSubtitle, compact && styles.itemSubtitleCompact, { color: colors.textMuted }]} numberOfLines={1}>
                {item.locationPath ? `${item.locationPath}  •  ` : ''}
                Note, {timeAgo(item.updatedAt || item.createdAt)}
              </Text>
            )}

            {item.type === 'folder' && (
              <Text style={[styles.itemSubtitle, compact && styles.itemSubtitleCompact, { color: colors.textMuted }]} numberOfLines={1}>
                {item.locationPath ? `${item.locationPath}  •  Folder` : 'Folder'}
              </Text>
            )}
          </View>

          {isSelectionMode ? (
            <Animated.View
              style={[
                styles.checkbox,
                {
                  borderColor: isSelected ? '#0A84FF' : colors.border,
                  backgroundColor: isSelected ? '#0A84FF' : 'transparent',
                },
                animatedCheckStyle,
              ]}
            >
              {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </Animated.View>
          ) : (
            !item.uploading &&
            !isUploading && (
              <TouchableOpacity
                onPress={handleMenuPress}
                style={[styles.menuBtn, compact && styles.menuBtnCompact]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="ellipsis-horizontal" size={compact ? 18 : 20} color={colors.textMuted} />
              </TouchableOpacity>
            )
          )}
        </TouchableOpacity>
      </Swipeable>
    </Animated.View>
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
  listItemCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 2.5,
    borderRadius: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxCompact: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  contentWrap: {
    flex: 1,
    paddingRight: SPACE.md,
    marginLeft: SPACE.md,
  },
  contentWrapCompact: {
    marginLeft: 10,
    paddingRight: 6,
  },
  itemTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.base,
  },
  itemTitleCompact: {
    fontSize: 14.5,
    lineHeight: 19,
  },
  itemSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    marginTop: 2,
  },
  itemSubtitleCompact: {
    fontSize: 11,
    marginTop: 1,
  },
  menuBtnCompact: {
    padding: 4,
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
  actionLeftContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    marginVertical: SPACE.xs,
  },
  actionLeft: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionRightContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    marginVertical: SPACE.xs,
  },
  actionRight: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default StorageNodeRow;
