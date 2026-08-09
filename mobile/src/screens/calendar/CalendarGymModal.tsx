/**
 * CalendarGymModal.tsx
 * Modal to edit the start and end times of a gym session directly from the calendar.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Gym Time</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#8e8e93" />
            </TouchableOpacity>
          </View>
          <View style={{ gap: 16, marginTop: 12 }}>
            <View>
              <Text style={{ color: '#8e8e93', fontSize: 12, marginBottom: 8 }}>Start Time (HH:MM)</Text>
              <TextInput
                style={{ backgroundColor: '#1c1c1e', color: '#fff', padding: 12, borderRadius: 8, fontSize: 16 }}
                value={gymStartTimeInput}
                onChangeText={setGymStartTimeInput}
                placeholder="10:00"
                placeholderTextColor="#5a5a5f"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View>
              <Text style={{ color: '#8e8e93', fontSize: 12, marginBottom: 8 }}>End Time (HH:MM)</Text>
              <TextInput
                style={{ backgroundColor: '#1c1c1e', color: '#fff', padding: 12, borderRadius: 8, fontSize: 16 }}
                value={gymEndTimeInput}
                onChangeText={setGymEndTimeInput}
                placeholder="11:00"
                placeholderTextColor="#5a5a5f"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <TouchableOpacity 
              style={{ backgroundColor: '#a599ff', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 }}
              onPress={onSave}
            >
              <Text style={{ color: '#000', fontWeight: '700', fontSize: 16 }}>Save Time</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
