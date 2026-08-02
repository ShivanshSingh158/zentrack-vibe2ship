import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { hapticMedium } from '../../utils/haptics';
import { useTheme } from "../../contexts/ThemeContext";

interface Props {
  visible: boolean;
  onClose: () => void;
  currentStartTime?: string; // "HH:MM"
  currentEndTime?: string; // "HH:MM"
  onSave: (start: string, end: string) => void;
}

export function GymScheduleModal({ visible, onClose, currentStartTime, currentEndTime, onSave }: Props) {
  const { colors, isDark } = useTheme();
  const s = makeStyles(colors);

  const [startTime, setStartTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date>(new Date());
  
  const [showPicker, setShowPicker] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (visible) {
      const startD = new Date();
      if (currentStartTime) {
        const [h, m] = currentStartTime.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) startD.setHours(h, m, 0, 0);
      } else {
        startD.setHours(17, 0, 0, 0); // Default 5:00 PM
      }
      setStartTime(startD);

      const endD = new Date();
      if (currentEndTime) {
        const [h, m] = currentEndTime.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) endD.setHours(h, m, 0, 0);
      } else {
        endD.setHours(startD.getHours() + 1, startD.getMinutes(), 0, 0); // Default 1 hour later
      }
      setEndTime(endD);
    }
  }, [visible, currentStartTime, currentEndTime]);

  const handleSave = () => {
    hapticMedium();
    const startStr = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
    const endStr = `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`;
    onSave(startStr, endStr);
    onClose();
  };

  const formatTime = (d: Date) => {
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
          <View style={s.header}>
            <Text style={s.title}>Schedule Workout</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={s.description}>
            Block out this time in your calendar and timeline view for today's workout.
          </Text>

          <View style={s.row}>
            <View style={s.rowText}>
              <Text style={s.rowTitle}>Start Time</Text>
            </View>
            <TouchableOpacity style={s.timeBtn} onPress={() => setShowPicker('start')}>
              <Text style={s.timeText}>{formatTime(startTime)}</Text>
            </TouchableOpacity>
          </View>
          {showPicker === 'start' && (
            <View style={s.pickerWrapper}>
              <DateTimePicker
                value={startTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, date) => {
                  if (Platform.OS === 'android') setShowPicker(null);
                  if (date) {
                    setStartTime(date);
                    // auto-adjust end time to be 1 hour later if it was before
                    const newEnd = new Date(date);
                    newEnd.setHours(date.getHours() + 1);
                    setEndTime(newEnd);
                  }
                }}
                textColor={colors.textPrimary}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity style={s.pickerDoneBtn} onPress={() => setShowPicker(null)}>
                  <Text style={s.pickerDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={s.row}>
            <View style={s.rowText}>
              <Text style={s.rowTitle}>End Time</Text>
            </View>
            <TouchableOpacity style={s.timeBtn} onPress={() => setShowPicker('end')}>
              <Text style={s.timeText}>{formatTime(endTime)}</Text>
            </TouchableOpacity>
          </View>
          {showPicker === 'end' && (
            <View style={s.pickerWrapper}>
              <DateTimePicker
                value={endTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, date) => {
                  if (Platform.OS === 'android') setShowPicker(null);
                  if (date) setEndTime(date);
                }}
                textColor={colors.textPrimary}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity style={s.pickerDoneBtn} onPress={() => setShowPicker(null)}>
                  <Text style={s.pickerDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
            <Text style={s.saveBtnText}>Save Time Slot</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACE.md,
    paddingBottom: Platform.OS === 'ios' ? 40 : SPACE.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.sm,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.lg,
    color: colors.textPrimary,
  },
  description: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
    marginBottom: SPACE.md,
    lineHeight: 20,
  },
  closeBtn: {
    padding: SPACE.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACE.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
  },
  timeBtn: {
    backgroundColor: colors.surfaceHighlight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
  },
  timeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
  },
  pickerWrapper: {
    alignItems: 'center',
    paddingVertical: SPACE.sm,
    backgroundColor: colors.background,
    borderRadius: RADIUS.md,
    marginTop: SPACE.xs,
  },
  pickerDoneBtn: {
    alignSelf: 'flex-end',
    padding: SPACE.sm,
    marginRight: SPACE.sm,
  },
  pickerDoneText: {
    color: colors.accentPrimary,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
  },
  saveBtn: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACE.xl,
  },
  saveBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.surface,
  },
});
