import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import AnimatedPressable from '../AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from "../../contexts/ThemeContext";
import { timeAgo } from '../../utils/dateUtils';

const UploadProgressRing = ({ progress }: { progress: number }) => {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const radius = 12;
  const stroke = 3;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View style={styles.autoStyle1}>
      <Svg height="32" width="32" viewBox="0 0 32 32">
        <Circle stroke="#2c2c2e" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx="16" cy="16" />
        <Circle
          stroke="#a599ff"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          strokeDashoffset={strokeDashoffset}
          r={normalizedRadius} cx="16" cy="16"
          strokeLinecap="round"
          transform="rotate(-90 16 16)"
        />
      </Svg>
    </View>
  );
};

export const StorageNodeGrid = React.memo(({
  items,
  uploading,
  uploadFileName,
  uploadProgress,
  uploadSize,
  selectedIds,
  selectionMode,
  setSelectionMode,
  setSelectedIds,
  setCurrentFolderId,
  setEditorNote,
  setViewerNode,
  setMenuItem,
  getIcon
}: any) => {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const data = uploading ? [{ id: 'uploading-temp', name: uploadFileName || 'Uploading...', type: 'file', uploading: true } as any, ...items] : items;

  return (
    <FlashList<any>
      data={data}
      keyExtractor={item => item.id!}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="folder-open-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>This folder is empty.</Text>
        </View>
      }
      renderItem={({ item }: { item: any }) => {
        const isSelected = selectedIds.has(item.id!);
        return (
          <AnimatedPressable
            style={[styles.listItem, isSelected && { borderColor: '#0A84FF', backgroundColor: 'rgba(10,132,255,0.1)' }]}
            onPress={() => {
              if (item.uploading) return;
              if (selectionMode) {
                const newSet = new Set(selectedIds);
                if (newSet.has(item.id!)) newSet.delete(item.id!);
                else newSet.add(item.id!);
                setSelectedIds(newSet);
              } else {
                if (item.type === 'folder') setCurrentFolderId(item.id!);
                else if (item.type === 'note') setEditorNote(item);
                else if (item.type === 'file') setViewerNode(item);
              }
            }}
            onLongPress={() => {
              if (!selectionMode && !item.uploading) {
                setSelectionMode(true);
                setSelectedIds(new Set([item.id!]));
              }
            }}
          >
            {item.uploading ? (
              <View style={styles.autoStyle22}>
                <UploadProgressRing progress={uploadProgress} />
              </View>
            ) : getIcon(item.type, item.fileType)}
            <View style={styles.autoStyle23}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.pinned && <Ionicons name="pin" size={12} color={colors.textPrimary} />}{' '}
                {item.name}
              </Text>
              {item.type === 'file' && (
                <Text style={styles.autoStyle24}>
                  {item.uploading ? `${uploadSize}, uploading, ${uploadProgress}%` : (item.size ? (item.size / (1024*1024)).toFixed(1) + ' MB' : 'Unknown size')}
                </Text>
              )}
              {item.type === 'note' && (
                <Text style={styles.autoStyle25}>
                  Note, {timeAgo(item.updatedAt || item.createdAt)}
                </Text>
              )}
            </View>
            {selectionMode ? (
              <View style={[styles.selectionCircle, isSelected && styles.selectionCircleActive]}>
                {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
            ) : (
              !item.uploading && (
                <AnimatedPressable onPress={() => setMenuItem(item)} style={styles.autoStyle27}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
                </AnimatedPressable>
              )
            )}
          </AnimatedPressable>
        );
      }}
      // @ts-ignore
      estimatedItemSize={70}
    />
  );
});

const makeStyles = (colors: any) => StyleSheet.create({
      list: { padding: 16, paddingBottom: 120 },
      emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
      emptyText: { fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textMuted, marginTop: 16 },
      listItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#1c1c1e', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#2c2c2e' },
      itemTitle: { fontFamily: 'Inter_500Medium', fontSize: 16, color: '#f2f2f7', marginBottom: 4 },
      autoStyle1: { alignItems: 'center', justifyContent: 'center' },
      autoStyle22: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e' },
      autoStyle23: { flex: 1, marginLeft: 12 },
      autoStyle24: { fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.textMuted },
      autoStyle25: { fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.textMuted },
      autoStyle27: { padding: 8 },
      selectionCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#636366', alignItems: 'center', justifyContent: 'center' },
      selectionCircleActive: { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
    });
