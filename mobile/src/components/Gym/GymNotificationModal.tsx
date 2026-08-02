import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable, Switch, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { hapticMedium, hapticSelection } from '../../utils/haptics';
import { useTheme } from "../../contexts/ThemeContext";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** BUG-3 FIX: Called after settings are saved so the parent can trigger
   * clearScheduleCache() + scheduleAllNotifications() immediately without
   * waiting for the next app open or Firestore data change. */
  onSaved?: () => void;
}

export function GymNotificationModal({ visible, onClose, onSaved }: Props) {
    const { colors, isDark } = useTheme();
    const s = makeStyles(colors);
  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  const loadSettings = async () => {
    const enabledStr = await AsyncStorage.getItem('@gym_notification_enabled');
    setEnabled(enabledStr !== 'false');

    const timeStr = await AsyncStorage.getItem('@gym_notification_time');
    const d = new Date();
    if (timeStr) {
      const [h, m] = timeStr.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        d.setHours(h, m, 0, 0);
      }
    } else {
      d.setHours(18, 0, 0, 0);
    }
    setTime(d);
  };

  const handleSave = async () => {
    hapticMedium();
    await AsyncStorage.setItem('@gym_notification_enabled', enabled.toString());
    const hours = time.getHours();
    // BUG-3 FIX: Zero-pad minutes for consistent storage format ("18:05" not "18:5")
    const minutes = time.getMinutes().toString().padStart(2, '0');
    await AsyncStorage.setItem('@gym_notification_time', `${hours}:${minutes}`);
    // BUG-3 FIX: Call onSaved() so the parent can trigger an immediate reschedule.
    // Previously only Alert.alert was shown, so changes required an app restart.
    onSaved?.();
    Alert.alert('Saved', 'Gym reminder updated.');
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
            <Text style={s.title}>Workout Reminders</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={s.row}>
            <View style={s.rowText}>
              <Text style={s.rowTitle}>Enable Reminders</Text>
              <Text style={s.rowSub}>Get a nudge to workout on your scheduled gym days.</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(val) => { hapticSelection(); setEnabled(val); }}
              trackColor={{ false: colors.border, true: '#FFFFFF' }}
              thumbColor={Platform.OS === 'android' ? '#000000' : undefined}
            />
          </View>

          {enabled && (
            <View style={s.row}>
              <View style={s.rowText}>
                <Text style={s.rowTitle}>Reminder Time</Text>
              </View>
              <TouchableOpacity style={s.timeBtn} onPress={() => setShowPicker(true)}>
                <Text style={s.timeBtnText}>{formatTime(time)}</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
            <Text style={s.saveBtnText}>Save Settings</Text>
          </TouchableOpacity>
        </Pressable>

        {showPicker && (
          <DateTimePicker
            value={time}
            mode="time"
            display="default"
            onChange={(event, selectedDate) => {
              setShowPicker(Platform.OS === 'ios');
              if (selectedDate && event.type !== 'dismissed') {
                setTime(selectedDate);
              }
            }}
          />
        )}
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
        backgroundColor: '#000000',
        borderTopLeftRadius: RADIUS.xxl,
        borderTopRightRadius: RADIUS.xxl,
        padding: SPACE.xl,
        paddingBottom: SPACE.xxl,
        borderWidth: 1,
        borderColor: '#27272A',
      },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACE.xxl,
      },
      title: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: FONT_SIZE.xl,
        color: colors.textPrimary,
      },
      closeBtn: {
        padding: SPACE.xs,
      },
      row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1c1c1e',
        padding: SPACE.lg,
        borderRadius: RADIUS.lg,
        marginBottom: SPACE.md,
      },
      rowText: {
        flex: 1,
        paddingRight: SPACE.md,
      },
      rowTitle: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: FONT_SIZE.base,
        color: colors.textPrimary,
        marginBottom: 4,
      },
      rowSub: {
        fontFamily: FONT_FAMILY.body,
        fontSize: FONT_SIZE.sm,
        color: colors.textSecondary,
        lineHeight: 18,
      },
      timeBtn: {
        backgroundColor: '#2c2c2e',
        paddingHorizontal: SPACE.md,
        paddingVertical: SPACE.sm,
        borderRadius: RADIUS.md,
      },
      timeBtnText: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: FONT_SIZE.base,
        color: colors.textPrimary,
      },
      saveBtn: {
        backgroundColor: colors.textPrimary,
        paddingVertical: SPACE.lg,
        borderRadius: RADIUS.xl,
        alignItems: 'center',
        marginTop: SPACE.xl,
      },
      saveBtnText: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: FONT_SIZE.md,
        color: colors.background,
      },
    });
