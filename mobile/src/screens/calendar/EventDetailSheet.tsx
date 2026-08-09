/**
 * EventDetailSheet.tsx
 * Modal showing details for a selected calendar event.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACE } from '../../theme/tokens';
import { CustomEvent } from '../../contexts/MobileDataContext';

interface EventDetailSheetProps {
  visible: boolean;
  selectedEvent: CustomEvent | null;
  selectedDate: string;
  styles: any;
  colors: any;
  onClose: () => void;
  onEdit: () => void;
}

export function EventDetailSheet({
  visible, selectedEvent, selectedDate, styles, colors, onClose, onEdit
}: EventDetailSheetProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: SPACE.md }}>
              <TouchableOpacity onPress={onEdit}>
                <Ionicons name="pencil" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity>
                <Ionicons name="ellipsis-vertical" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.modalTitle}>{selectedEvent?.title}</Text>
          <View style={styles.modalRow}>
            <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
            <Text style={styles.modalText}>{selectedDate}</Text>
          </View>
          {selectedEvent?.startTime && (
            <View style={styles.modalRow}>
              <Ionicons name="time-outline" size={20} color={colors.textMuted} />
              <Text style={styles.modalText}>
                {selectedEvent.startTime} {selectedEvent.endTime ? `- ${selectedEvent.endTime}` : ''}
              </Text>
            </View>
          )}
          {selectedEvent?.location && (
            <View style={styles.modalRow}>
              <Ionicons name="location-outline" size={20} color={colors.textMuted} />
              <Text style={styles.modalText}>{selectedEvent.location}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
