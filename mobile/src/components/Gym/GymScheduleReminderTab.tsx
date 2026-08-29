import React from 'react';
import { View, Text, TouchableOpacity, Switch, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

export interface GymScheduleReminderTabProps {
  notifEnabled: boolean;
  setNotifEnabled: (v: boolean) => void;
  notifTime: Date;
  setNotifTime: (d: Date) => void;
  showPickerNotif: boolean;
  setShowPickerNotif: (v: boolean) => void;
  onSave: () => void;
  formatTime: (d: Date) => string;
  styles: any;
  colors: any;
}

export const GymScheduleReminderTab: React.FC<GymScheduleReminderTabProps> = React.memo(({
  notifEnabled,
  setNotifEnabled,
  notifTime,
  setNotifTime,
  showPickerNotif,
  setShowPickerNotif,
  onSave,
  formatTime,
  styles,
  colors,
}) => {
  return (
    <>
      <Text style={styles.description}>
        Receive daily reminders before your planned workout sessions so you never miss a workout.
      </Text>

      <View style={styles.settingRow}>
        <View>
          <Text style={styles.settingLabel}>Workout Reminders</Text>
          <Text style={styles.settingSub}>Push notification on training days</Text>
        </View>
        <Switch
          value={notifEnabled}
          onValueChange={setNotifEnabled}
          trackColor={{ false: 'rgba(255,255,255,0.1)', true: colors.accentPrimary }}
        />
      </View>

      {notifEnabled && (
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>Reminder Time</Text>
            <Text style={styles.settingSub}>Alert sent at this time</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowPickerNotif(true)}
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: colors.accentPrimary, fontWeight: '700' }}>
              {formatTime(notifTime)}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {showPickerNotif && (
        <DateTimePicker
          value={notifTime}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            setShowPickerNotif(Platform.OS === 'ios');
            if (selectedDate) setNotifTime(selectedDate);
          }}
        />
      )}

      <View style={{ height: 20 }} />
      <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
        <Text style={styles.saveBtnText}>Save Notification Settings</Text>
      </TouchableOpacity>
    </>
  );
});

export default GymScheduleReminderTab;
