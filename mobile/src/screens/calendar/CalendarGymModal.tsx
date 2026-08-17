import React from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

interface CalendarGymModalProps {
  visible: boolean;
  styles: any;
  gymStartTimeInput: string;
  setGymStartTimeInput: (time: string) => void;
  gymEndTimeInput: string;
  setGymEndTimeInput: (time: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function CalendarGymModal({
  visible, styles, gymStartTimeInput, setGymStartTimeInput,
  gymEndTimeInput, setGymEndTimeInput, onClose, onSave
}: CalendarGymModalProps) {
  const { colors, isDark } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Gym Time</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={{ gap: 16, marginTop: 12 }}>
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>Start Time (HH:MM)</Text>
              <TextInput
                style={{
                  backgroundColor: isDark ? '#1c1c1e' : '#F5F4FA',
                  color: colors.textPrimary,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 16,
                }}
                value={gymStartTimeInput}
                onChangeText={setGymStartTimeInput}
                placeholder="10:00"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>End Time (HH:MM)</Text>
              <TextInput
                style={{
                  backgroundColor: isDark ? '#1c1c1e' : '#F5F4FA',
                  color: colors.textPrimary,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 16,
                }}
                value={gymEndTimeInput}
                onChangeText={setGymEndTimeInput}
                placeholder="11:00"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <TouchableOpacity 
              style={{
                backgroundColor: isDark ? '#a599ff' : colors.accentPrimary,
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
                marginTop: 8,
              }}
              onPress={onSave}
            >
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700', fontSize: 16 }}>Save Time</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
