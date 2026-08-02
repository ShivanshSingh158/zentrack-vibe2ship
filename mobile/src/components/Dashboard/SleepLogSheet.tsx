import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { BlurView } from 'expo-blur';
import { addDoc, collection, setDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleAllNotifications } from '../../services/notifications';
import { Switch } from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

const BED_TIMES = [
  { label: '9 PM', val: 21 },
  { label: '10 PM', val: 22 },
  { label: '11 PM', val: 23 },
  { label: '12 AM', val: 24 },
  { label: '1 AM', val: 25 },
  { label: '2 AM', val: 26 },
  { label: '3 AM', val: 27 },
];

const WAKE_TIMES = [
  { label: '5 AM', val: 5 },
  { label: '6 AM', val: 6 },
  { label: '7 AM', val: 7 },
  { label: '8 AM', val: 8 },
  { label: '9 AM', val: 9 },
  { label: '10 AM', val: 10 },
  { label: '11 AM', val: 11 },
];

export default function SleepLogSheet({ visible, onClose, userId }: Props) {
  const { colors, isDark } = useTheme();
  const s = makeStyles(colors);
  const navigation = useNavigation<any>();

  const [bedTime, setBedTime] = useState(23);
  const [wakeTime, setWakeTime] = useState(7);
  const [remindersEnabled, setRemindersEnabled] = useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem('@zentrack_sleep_reminders_enabled').then(val => {
      if (val === 'true') setRemindersEnabled(true);
    });
    AsyncStorage.getItem('@zentrack_sleep_reminder_night').then(val => {
      if (val) setBedTime(parseInt(val, 10));
    });
    AsyncStorage.getItem('@zentrack_sleep_reminder_morning').then(val => {
      if (val) setWakeTime(parseInt(val, 10));
    });
  }, []);

  const handleToggleReminders = async (val: boolean) => {
    setRemindersEnabled(val);
    await AsyncStorage.setItem('@zentrack_sleep_reminders_enabled', val.toString());
    await AsyncStorage.setItem('@zentrack_sleep_reminder_night', bedTime.toString());
    await AsyncStorage.setItem('@zentrack_sleep_reminder_morning', wakeTime.toString());
    // Pass empty arrays — the purpose here is just to flush the fingerprint cache
    // so the next context-driven reschedule picks up the new sleep prefs.
    // clearScheduleCache() is not imported here, but passing empty params forces
    // a cache miss and a full reschedule on the next real data update.
    scheduleAllNotifications({ tasks: [], customEvents: [], gymLogs: [], attendance: [] });
  };

  const updateTimes = async (type: 'bed' | 'wake', val: number) => {
    if (type === 'bed') setBedTime(val);
    else setWakeTime(val);
    
    if (remindersEnabled) {
      await AsyncStorage.setItem('@zentrack_sleep_reminder_night', type === 'bed' ? val.toString() : bedTime.toString());
      await AsyncStorage.setItem('@zentrack_sleep_reminder_morning', type === 'wake' ? val.toString() : wakeTime.toString());
      scheduleAllNotifications({ tasks: [], customEvents: [], gymLogs: [], attendance: [] });
    }
  };

  const hours = useMemo(() => {
    // Both mapped to a 24 hour period from noon to noon essentially.
    // E.g. Bedtime 11 PM (23), Wake 7 AM. 24 is midnight.
    // We add 24 to wakeTime to get next day hours.
    const wake = wakeTime + 24; 
    return wake - bedTime;
  }, [bedTime, wakeTime]);

  const handleLog = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const todayStr = new Date().toISOString().split('T')[0];
    
    try {
      // Use setDoc so we overwrite the sleep log for today instead of creating duplicates
      await setDoc(doc(db, COLLECTION.SLEEP_LOGS, `${userId}_${todayStr}`), {
        userId,
        date: todayStr,
        hours,
        timestamp: Date.now()
      });
      onClose();
    } catch (e) {
      console.error('Error logging sleep', e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <BlurView intensity={isDark ? 50 : 20} tint={isDark ? "dark" : "light"} style={s.overlay}>
        <TouchableOpacity style={{ flex: 1, width: '100%' }} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>Log Sleep</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={s.subtitle}>When did you sleep last night and wake up today?</Text>

          {/* Bed Time Selector */}
          <Text style={s.sectionTitle}>Bedtime</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scrollRow} style={{ marginBottom: SPACE.xl }}>
            {BED_TIMES.map(item => (
              <TouchableOpacity
                key={item.val}
                style={[s.pill, bedTime === item.val && { backgroundColor: '#5E5CE6', borderColor: '#5E5CE6' }]}
                onPress={() => updateTimes('bed', item.val)}
              >
                <Text style={[s.pillText, bedTime === item.val && { color: '#fff' }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Wake Time Selector */}
          <Text style={s.sectionTitle}>Wake up time</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scrollRow} style={{ marginBottom: SPACE.xxl }}>
            {WAKE_TIMES.map(item => (
              <TouchableOpacity
                key={item.val}
                style={[s.pill, wakeTime === item.val && { backgroundColor: '#5E5CE6', borderColor: '#5E5CE6' }]}
                onPress={() => updateTimes('wake', item.val)}
              >
                <Text style={[s.pillText, wakeTime === item.val && { color: '#fff' }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={s.reminderRow}>
            <View>
              <Text style={s.reminderTitle}>Daily Sleep Reminders</Text>
              <Text style={s.reminderSubtitle}>Get notified at bedtime and wake time.</Text>
            </View>
            <Switch
              value={remindersEnabled}
              onValueChange={handleToggleReminders}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#5E5CE6' }}
            />
          </View>

          {/* Result & Submit */}
          <View style={s.footer}>
            <View>
              <Text style={s.resultLabel}>Total Sleep</Text>
              <Text style={s.resultValue}>{hours} hours</Text>
            </View>
            
            <TouchableOpacity style={s.saveBtn} onPress={handleLog}>
              <Text style={s.saveBtnText}>Log Sleep</Text>
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: SPACE.xl }}>
            <TouchableOpacity
              style={s.dashboardBtn}
              onPress={() => {
                onClose();
                navigation.navigate('MoreStack', { screen: 'WellbeingDashboard' });
              }}
            >
              <Ionicons name="bar-chart-outline" size={20} color={colors.accentPrimary} />
              <Text style={s.dashboardBtnText}>View Wellbeing Dashboard</Text>
            </TouchableOpacity>
          </View>

        </View>
      </BlurView>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    paddingTop: SPACE.xl,
    paddingBottom: SPACE.xxl * 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.sm,
    paddingHorizontal: SPACE.xl,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xl,
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: SPACE.xs,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
    marginBottom: SPACE.xl,
    paddingHorizontal: SPACE.xl,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.base,
    color: colors.textPrimary,
    marginBottom: SPACE.sm,
    paddingHorizontal: SPACE.xl,
  },
  scrollRow: {
    paddingHorizontal: SPACE.xl,
    gap: SPACE.sm,
  },
  pill: {
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: colors.borderHover,
    backgroundColor: colors.surface,
  },
  pillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: colors.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: SPACE.xl,
  },
  resultLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.xs,
    color: colors.textSecondary,
  },
  resultValue: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xl,
    color: '#5E5CE6',
  },
  dashboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(165,153,255,0.1)',
    borderRadius: RADIUS.lg,
    paddingVertical: SPACE.md,
    marginTop: SPACE.xl,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.3)',
  },
  dashboardBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
    marginLeft: SPACE.sm,
  },
  reminderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.md,
    marginTop: -SPACE.md,
    marginBottom: SPACE.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACE.xl,
  },
  reminderTitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
  },
  reminderSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: colors.textPrimary,
    paddingHorizontal: SPACE.xxl,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.full,
  },
  saveBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: colors.background,
  }
});
