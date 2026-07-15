import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, SPACE, RADIUS, FONT_SIZE } from '../../theme/tokens';
import { GymCardioLog } from '../../types/gym.types';

interface Props {
  visible: boolean;
  cardio: GymCardioLog | null;
  onClose: () => void;
  onSave: (updates: Partial<GymCardioLog>) => void;
}

export function LogCardioModal({ visible, cardio, onClose, onSave }: Props) {
  const [minutes, setMinutes] = useState('');
  const [km, setKm] = useState('');
  const [incline, setIncline] = useState('');

  useEffect(() => {
    if (visible && cardio) {
      setMinutes(cardio.durationMinutes ? String(cardio.durationMinutes) : '');
      setKm(cardio.distanceKm ? String(cardio.distanceKm) : '');
      setIncline(cardio.incline ? String(cardio.incline) : '');
    }
  }, [visible, cardio]);

  if (!cardio) return null;

  const handleSave = () => {
    onSave({
      durationMinutes: minutes ? parseFloat(minutes) : null,
      distanceKm: km ? parseFloat(km) : null,
      incline: incline ? parseFloat(incline) : null,
      completed: true,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Log {cardio.type}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Duration (Minutes)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 30"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="numeric"
                value={minutes}
                onChangeText={setMinutes}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Distance (km)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 5.5"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="numeric"
                value={km}
                onChangeText={setKm}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Degree of Inclination</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 12"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="numeric"
                value={incline}
                onChangeText={setIncline}
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save & Mark Complete</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACE.xl, paddingBottom: SPACE.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.xl },
  title: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, color: COLORS.textPrimary },
  closeBtn: { padding: SPACE.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.full },
  inputGroup: { marginBottom: SPACE.lg },
  label: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginBottom: SPACE.xs },
  input: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, color: COLORS.textPrimary, fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.md },
  saveBtn: { backgroundColor: COLORS.success, borderRadius: RADIUS.md, padding: SPACE.lg, alignItems: 'center', marginTop: SPACE.md },
  saveBtnText: { color: '#000', fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md },
});
