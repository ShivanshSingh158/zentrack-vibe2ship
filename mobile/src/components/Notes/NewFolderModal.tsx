/**
 * NewFolderModal.tsx — ZenTrack Mobile
 *
 * Lightweight, isolated modal for creating new folders with instant keyboard focus.
 */

import React, { useState } from 'react';
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
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';

interface NewFolderModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  colors: any;
  isDark: boolean;
}

export const NewFolderModal = React.memo(function NewFolderModal({
  visible,
  onClose,
  onCreate,
  colors,
  isDark,
}: NewFolderModalProps) {
  const [folderName, setFolderName] = useState('');

  if (!visible) return null;

  const handleCreate = () => {
    const trimmed = folderName.trim();
    if (!trimmed) return;
    feedback.commit();
    onCreate(trimmed);
    setFolderName('');
  };

  const handleClose = () => {
    setFolderName('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBg}
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>New Folder</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? '#000000' : '#F5F4FA',
                color: colors.textPrimary,
                borderColor: colors.border,
              },
            ]}
            placeholder="Folder Name"
            placeholderTextColor={colors.textMuted}
            value={folderName}
            onChangeText={setFolderName}
            autoFocus
            onSubmitEditing={handleCreate}
          />
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: isDark ? '#08080A' : '#ECEBF2' }]}
              onPress={handleClose}
            >
              <Text style={[styles.btnTextCancel, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.accentPrimary }]}
              onPress={handleCreate}
            >
              <Text style={[styles.btnTextPrimary, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                Create
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

export default NewFolderModal;
