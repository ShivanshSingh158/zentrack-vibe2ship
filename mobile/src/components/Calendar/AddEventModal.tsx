import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { db } from '../../services/firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { useMobileData, CustomEvent } from '../../contexts/MobileDataContext';
import { COLLECTION } from '../../config/constants';
import { useTheme } from "../../contexts/ThemeContext";

const EVENT_TYPES = [
  { id: 'exam', label: 'Exam', icon: '📝', color: '#ef4444' },
  { id: 'assignment_due', label: 'Assignment', icon: '📋', color: '#8b5cf6' },
  { id: 'holiday', label: 'Holiday', icon: '🌴', color: '#10b981' },
  { id: 'todo', label: 'Task', icon: '✅', color: '#7c3aed' },
  { id: 'job', label: 'Interview', icon: '💼', color: '#fbbf24' },
];

export function AddEventModal({ visible, onClose, selectedDate, initialStartTime, existingEvent }: { 
  visible: boolean; 
  onClose: () => void; 
  selectedDate: string;
  initialStartTime?: string;
  existingEvent?: CustomEvent | null;
}) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const { user } = useMobileData();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('exam');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (visible) {
      if (existingEvent) {
        setTitle(existingEvent.title);
        setType(existingEvent.type);
        setStartTime(existingEvent.startTime || '');
        setEndTime(existingEvent.endTime || '');
      } else {
        setTitle('');
        setType('exam');
        setStartTime(initialStartTime || '');
        setEndTime('');
      }
    }
  }, [visible, existingEvent, initialStartTime]);

  const handleSave = async () => {
    if (!title.trim() || !user) return;
    setLoading(true);
    try {
      const payload: any = {
        title: title.trim(),
        type,
        date: existingEvent?.date || selectedDate,
        userId: user.uid,
        updatedAt: Date.now(),
      };
      if (startTime) payload.startTime = startTime;
      if (endTime) payload.endTime = endTime;

      if (existingEvent) {
        await updateDoc(doc(db, COLLECTION.CALENDAR_EVENTS, existingEvent.id), payload);
      } else {
        payload.createdAt = Date.now();
        await addDoc(collection(db, COLLECTION.CALENDAR_EVENTS), payload);
      }
      onClose();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{existingEvent ? 'Edit Event' : 'Add New Event'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Event Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Final Physics Exam"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              autoFocus
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Event Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
              {EVENT_TYPES.map(t => (
                <TouchableOpacity 
                  key={t.id} 
                  style={[styles.typeChip, type === t.id && { backgroundColor: t.color, borderColor: t.color }]}
                  onPress={() => setType(t.id)}
                >
                  <Text style={styles.typeIcon}>{t.icon}</Text>
                  <Text style={[styles.typeLabel, type === t.id && { color: '#fff' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date</Text>
            <View style={styles.readOnlyField}>
              <Ionicons name="calendar-outline" size={16} color={colors.textPrimary} />
              <Text style={styles.readOnlyText}>{existingEvent?.date || selectedDate}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.xl }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Start Time</Text>
              <TextInput
                style={styles.input}
                placeholder="09:00"
                placeholderTextColor={colors.textMuted}
                value={startTime}
                onChangeText={setStartTime}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>End Time</Text>
              <TextInput
                style={styles.input}
                placeholder="10:00"
                placeholderTextColor={colors.textMuted}
                value={endTime}
                onChangeText={setEndTime}
              />
            </View>
          </View>

          <TouchableOpacity style={[styles.saveBtn, (!title.trim() || loading) && styles.saveBtnDisabled]} onPress={handleSave} disabled={!title.trim() || loading}>
            <Text style={styles.saveBtnText}>{loading ? 'Saving...' : (existingEvent ? 'Save Changes' : 'Add Event')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
      modalSheet: { backgroundColor: colors.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACE.xl, paddingBottom: 40 },
      modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg },
      modalTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xl, color: colors.textPrimary },
      
      inputGroup: { marginBottom: SPACE.xl },
      label: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textMuted, marginBottom: SPACE.sm },
      input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.md, padding: SPACE.md, color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base },
      
      typeScroll: { flexDirection: 'row' },
      typeChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.full, borderWidth: 1, borderColor: colors.border, marginRight: SPACE.sm },
      typeIcon: { fontSize: 14 },
      typeLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary },
      
      readOnlyField: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, backgroundColor: colors.surface2, padding: SPACE.md, borderRadius: RADIUS.md },
      readOnlyText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base, color: colors.textPrimary },
      
      saveBtn: { backgroundColor: colors.textPrimary, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACE.lg },
      saveBtnDisabled: { opacity: 0.5 },
      saveBtnText: { color: colors.background, fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base },
    });
