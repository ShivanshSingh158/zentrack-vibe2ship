/**
 * GymProfileModal — ZenTrack Mobile
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { useTheme } from "../../contexts/ThemeContext";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function GymProfileModal({ visible, onClose }: Props) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState('Hypertrophy');

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Gym Profile</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bodyweight (kg)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 75"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={weight}
              onChangeText={setWeight}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Primary Goal</Text>
            <View style={styles.row}>
              {['Hypertrophy', 'Strength', 'Weight Loss'].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.pill, goal === g && styles.pillActive]}
                  onPress={() => setGoal(g)}
                >
                  <Text style={[styles.pillText, goal === g && styles.pillTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={onClose}>
            <Text style={styles.saveBtnText}>Save Profile</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: SPACE.xl },
      sheet: { backgroundColor: colors.background, borderRadius: RADIUS.xl, padding: SPACE.xl, borderWidth: 1, borderColor: colors.border, ...SHADOW.lg },
      header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.xl },
      title: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xl, color: colors.textPrimary },
      closeBtn: { padding: SPACE.sm, backgroundColor: colors.surface, borderRadius: RADIUS.full },
      inputGroup: { marginBottom: SPACE.xl },
      label: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textSecondary, marginBottom: SPACE.sm },
      input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.md, padding: SPACE.lg, color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base },
      row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
      pill: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
      pillActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
      pillText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textMuted },
      pillTextActive: { color: colors.background },
      saveBtn: { backgroundColor: colors.textPrimary, padding: SPACE.lg, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACE.md },
      saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.background },
    });
