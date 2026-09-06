/**
 * RenameNodeModal.tsx — ZenTrack Mobile
 *
 * Isolated, memoized modal for renaming files, folders, and notes.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import type { StorageNode } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';

interface RenameNodeModalProps {
  node: StorageNode | null;
  onClose: () => void;
  onSave: (node: StorageNode, newName: string) => void;
  colors: any;
  isDark: boolean;
}

export const RenameNodeModal = React.memo(function RenameNodeModal({
  node,
  onClose,
  onSave,
  colors,
  isDark,
}: RenameNodeModalProps) {
  const [nameValue, setNameValue] = useState(node?.name || '');

  useEffect(() => {
    if (node) {
      setNameValue(node.name || '');
    }
  }, [node]);

  if (!node) return null;

  const handleSave = () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === node.name) {
      onClose();
      return;
    }
    feedback.commit();
    onSave(node, trimmed);
    onClose();
  };

  return (
    <Modal visible={!!node} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBg}
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Rename Item</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? '#000000' : '#F5F4FA',
                color: colors.textPrimary,
                borderColor: colors.border,
              },
            ]}
            placeholder="Name"
            placeholderTextColor={colors.textMuted}
            value={nameValue}
            onChangeText={setNameValue}
            autoFocus
            selectTextOnFocus
            onSubmitEditing={handleSave}
          />
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: isDark ? '#08080A' : '#ECEBF2' }]}
              onPress={onClose}
            >
              <Text style={[styles.btnTextCancel, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.accentPrimary }]}
              onPress={handleSave}
            >
              <Text style={[styles.btnTextPrimary, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    gap: SPACE.md,
    borderWidth: 1,
  },
  modalTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.lg,
  },
  input: {
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.base,
    borderWidth: 1,
  },
  btnRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
    marginTop: SPACE.sm,
  },
  btn: {
    flex: 1,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  btnTextCancel: {
    fontFamily: FONT_FAMILY.bold,
  },
  btnTextPrimary: {
    fontFamily: FONT_FAMILY.bold,
  },
});

export default RenameNodeModal;
