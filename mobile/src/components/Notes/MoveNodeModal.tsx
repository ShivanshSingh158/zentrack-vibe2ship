/**
 * MoveNodeModal.tsx — ZenTrack Mobile
 *
 * Folder picker modal for moving single items or batch selections.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StorageNode } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';

interface MoveNodeModalProps {
  node: StorageNode | null;
  batchCount?: number;
  folders: StorageNode[];
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
  colors: any;
  isDark: boolean;
}

export const MoveNodeModal = React.memo(function MoveNodeModal({
  node,
  batchCount = 0,
  folders,
  onClose,
  onMove,
  colors,
  isDark,
}: MoveNodeModalProps) {
  const isBatch = !node && batchCount > 0;
  if (!node && !isBatch) return null;

  const title = isBatch
    ? `Move ${batchCount} item${batchCount > 1 ? 's' : ''}`
    : `Move "${node?.name}"`;

  const handleSelectFolder = (folderId: string | null) => {
    feedback.commit();
    onMove(folderId);
    onClose();
  };

  return (
    <Modal visible={!!node || isBatch} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
            Select a destination folder:
          </Text>

          <ScrollView style={styles.folderList} showsVerticalScrollIndicator={false}>
            {/* Root / Home */}
            <TouchableOpacity
              style={[styles.moveRow, { borderBottomColor: colors.border }]}
              onPress={() => handleSelectFolder(null)}
            >
              <View style={[styles.folderIcon, { backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.10)' }]}>
                <Ionicons name="home" size={18} color={colors.accentPrimary} />
              </View>
              <Text style={[styles.moveRowText, { color: colors.textPrimary }]}>Vault Root (Home)</Text>
            </TouchableOpacity>

            {/* Folder destinations */}
            {folders.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.moveRow, { borderBottomColor: colors.border }]}
                onPress={() => handleSelectFolder(f.id!)}
              >
                <View style={[styles.folderIcon, { backgroundColor: isDark ? 'rgba(10,132,255,0.15)' : 'rgba(2,132,199,0.10)' }]}>
                  <Ionicons name="folder" size={18} color={isDark ? '#0A84FF' : '#0284C7'} />
                </View>
                <Text style={[styles.moveRowText, { color: colors.textPrimary }]} numberOfLines={1}>
                  {f.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.btnCancel, { backgroundColor: isDark ? '#08080A' : '#ECEBF2' }]}
            onPress={onClose}
          >
            <Text style={[styles.btnTextCancel, { color: colors.textPrimary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: SPACE.xl,
  },
  modalSheet: {
    borderRadius: RADIUS.lg,
    padding: SPACE.xl,
    gap: SPACE.sm,
    borderWidth: 1,
    maxHeight: '80%',
  },
  modalTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.lg,
  },
  modalSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    marginBottom: SPACE.xs,
  },
  folderList: {
    maxHeight: 280,
    marginVertical: SPACE.sm,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: SPACE.sm,
    borderBottomWidth: 1,
  },
  folderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveRowText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.base,
    flex: 1,
  },
  btnCancel: {
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACE.sm,
  },
  btnTextCancel: {
    fontFamily: FONT_FAMILY.bold,
  },
});

export default MoveNodeModal;
