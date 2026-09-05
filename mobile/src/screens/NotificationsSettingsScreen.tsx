/**
 * NotificationsSettingsScreen — ZenTrack Mobile
 * Streamlined: Clean, purposeful, and 100% functional.
 * Removed: Fake toggles (XP milestones, inactivity, habit stacking, tone),
 *          and micro-customization bloat.
 * Kept:
 *  1. System Check & Diagnostics (Permissions, Send Test, View Scheduled Alarms, Diagnostics)
 *  2. Core Module Channels (Tasks, Habits, Gym, Classes)
 *  3. Daily Briefing & Task Alert Buffer
 *  4. Quiet Hours (Do Not Disturb window)
 *  5. Hydration (Water reminder interval)
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  InteractionManager,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../contexts/ThemeContext';
import {
  scheduleAllNotifications,
  clearScheduleCache,
  sendTestNotification,
  runNotificationDiagnostic,
} from '../services/notifications';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { usePlannerData } from '../contexts/domains/PlannerContext';

type TimePickerTarget = 'morningBriefTime' | 'quietStart' | 'quietEnd';

const KEY = (k: string) => `zentrack_notif_${k}`;

async function saveBool(key: string, val: boolean) {
  await AsyncStorage.setItem(KEY(key), String(val));
}
async function saveString(key: string, val: string) {
  await AsyncStorage.setItem(KEY(key), val);
}

function parseHM(s: string) {
  const [h, m] = (s || '09:00').split(':').map(Number);
  const d = new Date();
  d.setHours(isNaN(h) ? 9 : h, isNaN(m) ? 0 : m, 0, 0);
  return d;
}

function toHM(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function displayTime(hm: string) {
  if (!hm || !hm.includes(':')) return '--:--';
  const [h, m] = hm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '--:--';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getTriggerTimestamp(trigger: any, nowMs: number): number {
  if (!trigger) return 0;
  if (typeof trigger === 'number') return trigger;
  if (typeof trigger === 'string') {
    const t = new Date(trigger).getTime();
    if (!isNaN(t)) return t;
  }
  if (typeof trigger.timestamp === 'number') return trigger.timestamp;
  if (typeof trigger.value === 'number') return trigger.value;
  if (typeof trigger.value === 'string') {
    const t = new Date(trigger.value).getTime();
    if (!isNaN(t)) return t;
  }
  if (typeof trigger.date === 'number') return trigger.date;
  if (typeof trigger.date === 'string') {
    const t = new Date(trigger.date).getTime();
    if (!isNaN(t)) return t;
  }
  if (trigger.date instanceof Date) return trigger.date.getTime();
  if (typeof trigger.seconds === 'number') return nowMs + trigger.seconds * 1000;
  if (typeof trigger.timeInterval === 'number') return nowMs + trigger.timeInterval * 1000;
  if (typeof trigger.hour === 'number' && typeof trigger.minute === 'number') {
    const d = new Date(nowMs);
    d.setHours(trigger.hour, trigger.minute, 0, 0);
    if (d.getTime() <= nowMs) {
      d.setDate(d.getDate() + 1);
    }
    return d.getTime();
  }
  return 0;
}

function formatAlarmTrigger(triggerMs: number, nowMs: number): { label: string; countdown: string; isPast: boolean } {
  if (!triggerMs) return { label: 'Immediate', countdown: 'Now', isPast: false };
  const diffMs = triggerMs - nowMs;
  const diffMin = Math.round(diffMs / 60000);
  const isPast = diffMin < 0;
  const triggerDate = new Date(triggerMs);

  let countdown = '';
  if (isPast) {
    countdown = 'Just now';
  } else if (diffMin < 60) {
    countdown = `in ${Math.max(1, diffMin)}m`;
  } else if (diffMin < 24 * 60) {
    const hrs = Math.floor(diffMin / 60);
    const remMin = diffMin % 60;
    countdown = remMin > 0 ? `in ${hrs}h ${remMin}m` : `in ${hrs}h`;
  } else {
    const days = Math.round(diffMin / (24 * 60));
    countdown = `in ${days}d`;
  }

  const isToday = triggerDate.toDateString() === new Date(nowMs).toDateString();
  const tomDate = new Date(nowMs);
  tomDate.setDate(tomDate.getDate() + 1);
  const isTomorrow = triggerDate.toDateString() === tomDate.toDateString();

  const timeStr = triggerDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  let label = '';
  if (isToday) label = `Today, ${timeStr}`;
  else if (isTomorrow) label = `Tomorrow, ${timeStr}`;
  else {
    const dayStr = triggerDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    label = `${dayStr}, ${timeStr}`;
  }

  return { label, countdown, isPast };
}

function getCategoryInfo(item: any): { tag: string; icon: string; color: string } {
  const type = item.content?.data?.type || '';
  const channel = item.content?.channelId || item.trigger?.channelId || '';

  if (type === 'water_reminder' || channel === 'wellness') {
    return { tag: 'Water', icon: 'water', color: '#38BDF8' };
  }
  if (type === 'gym' || type === 'gym_rest') {
    return { tag: 'Gym', icon: 'barbell', color: '#5EDA9E' };
  }
  if (type === 'morning_brief') {
    return { tag: 'Briefing', icon: 'sunny', color: '#FF9F4D' };
  }
  if (type === 'habit_reminder' || type === 'habit_streak' || channel === 'habits') {
    return { tag: 'Habit', icon: 'flame', color: '#FF9F4D' };
  }
  if (type.startsWith('class_') || type.startsWith('lab_') || type === 'attendance_warning') {
    return { tag: 'Class', icon: 'school', color: '#FBBF24' };
  }
  if (type === 'sleep_night' || type === 'sleep_morning') {
    return { tag: 'Sleep', icon: 'moon', color: '#A599FF' };
  }
  if (type.startsWith('assignment_')) {
    return { tag: 'Assignment', icon: 'book', color: '#EF4444' };
  }
  if (item.content?.data?.taskId || channel === 'reminders' || type === 'overdue_nudge') {
    return { tag: 'Task', icon: 'checkmark-circle', color: '#A599FF' };
  }
  return { tag: 'Reminder', icon: 'notifications', color: '#A599FF' };
}

export default function NotificationsSettingsScreen() {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<any>();

  const { tasks, habitLogs, allHabits, user } = useCoreData();
  const { gymLogs, waterLogs, sleepLogs, userGymPlan } = useWellnessData();
  const { attendance, assignments, attendanceLogs } = useAcademicData();
  const { customEvents } = usePlannerData();

  // ── Core Module Toggles ──
  const [modTasks, setModTasks] = useState(true);
  const [modHabits, setModHabits] = useState(true);
  const [modGym, setModGym] = useState(true);
  const [modAttendance, setModAttendance] = useState(true);

  // ── Routine & Timing ──
  const [morningBrief, setMorningBrief] = useState(true);
  const [morningBriefTime, setMorningBriefTime] = useState('07:30');
  const [taskBuffer, setTaskBuffer] = useState('60'); // minutes

  // ── Quiet Hours ──
  const [quietHours, setQuietHours] = useState(true);
  const [quietStart, setQuietStart] = useState('23:00');
  const [quietEnd, setQuietEnd] = useState('07:00');

  // ── Hydration ──
  const [waterFreq, setWaterFreq] = useState('0'); // '0' | '1' | '2' | '3'

  // ── Permissions & Diagnostics ──
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [activeAlarmsModalVisible, setActiveAlarmsModalVisible] = useState(false);
  const [scheduledAlarms, setScheduledAlarms] = useState<any[]>([]);
  const [loadingAlarms, setLoadingAlarms] = useState(false);
  const [runningDiagnostic, setRunningDiagnostic] = useState(false);

  // ── Time Picker Modal ──
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<TimePickerTarget>('morningBriefTime');
  const [pickerDate, setPickerDate] = useState(new Date());

  const checkPermissions = useCallback(async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setHasPermission(status === 'granted');
    } catch {
      setHasPermission(false);
    }
  }, []);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  // Load preferences
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          const keys = [
            'mod_tasks',
            'mod_habits',
            'mod_gym',
            'mod_attendance',
            'morning_brief',
            'morning_brief_time',
            'task_buffer',
            'quiet_hours',
            'quiet_start',
            'quiet_end',
          ].map(KEY);

          const results = await AsyncStorage.multiGet([
            ...keys,
            '@zentrack_water_reminder_freq',
          ]);
          const dict = Object.fromEntries(results);

          const getB = (k: string, def = true) => {
            const v = dict[KEY(k)];
            return v === null || v === undefined ? def : v === 'true';
          };
          const getS = (k: string, def: string) => dict[KEY(k)] ?? def;

          setModTasks(getB('mod_tasks'));
          setModHabits(getB('mod_habits'));
          setModGym(getB('mod_gym'));
          setModAttendance(getB('mod_attendance'));

          setMorningBrief(getB('morning_brief'));
          setMorningBriefTime(getS('morning_brief_time', '07:30'));
          setTaskBuffer(getS('task_buffer', '60'));

          setQuietHours(getB('quiet_hours'));
          setQuietStart(getS('quiet_start', '23:00'));
          setQuietEnd(getS('quiet_end', '07:00'));

          setWaterFreq(dict['@zentrack_water_reminder_freq'] ?? '0');
        } catch (err) {
          console.warn('[NotificationsSettings] Failed loading preferences', err);
        }
      })();
    });
    return () => task.cancel();
  }, []);

  const reschedule = useCallback(() => {
    clearScheduleCache();
    scheduleAllNotifications({
      tasks,
      customEvents,
      gymLogs,
      attendance,
      habitLogs,
      allHabits,
      assignments,
      waterLogs,
      sleepLogs,
      userGymPlan,
      attendanceLogs,
    }).catch(console.warn);
  }, [
    tasks,
    customEvents,
    gymLogs,
    attendance,
    habitLogs,
    allHabits,
    assignments,
    waterLogs,
    sleepLogs,
    userGymPlan,
    attendanceLogs,
  ]);

  const toggle = useCallback(
    async (key: string, val: boolean, setter: (v: boolean) => void) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setter(val);
      await saveBool(key, val);
      reschedule();
    },
    [reschedule]
  );

  const openPicker = (target: TimePickerTarget, current: string) => {
    setPickerTarget(target);
    setPickerDate(parseHM(current));
    setPickerVisible(true);
  };

  const handlePickerChange = async (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setPickerVisible(false);
    if (!selected) return;
    const hm = toHM(selected);
    switch (pickerTarget) {
      case 'morningBriefTime':
        setMorningBriefTime(hm);
        await saveString('morning_brief_time', hm);
        break;
      case 'quietStart':
        setQuietStart(hm);
        await saveString('quiet_start', hm);
        break;
      case 'quietEnd':
        setQuietEnd(hm);
        await saveString('quiet_end', hm);
        break;
    }
    reschedule();
  };

  const handleOpenActiveAlarms = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoadingAlarms(true);
    setActiveAlarmsModalVisible(true);
    try {
      clearScheduleCache();
      await scheduleAllNotifications({
        tasks,
        customEvents,
        gymLogs,
        attendance,
        habitLogs,
        allHabits,
        assignments,
        waterLogs,
        sleepLogs,
        userGymPlan,
        attendanceLogs,
      });

      let scheduled = await Notifications.getAllScheduledNotificationsAsync();
      if (scheduled.length === 0) {
        await new Promise(r => setTimeout(r, 600));
        scheduled = await Notifications.getAllScheduledNotificationsAsync();
      }

      const nowMs = Date.now();
      const withTimes = scheduled.map((item: any) => ({
        ...item,
        triggerMs: getTriggerTimestamp(item.trigger, nowMs),
      }));

      withTimes.sort((a: any, b: any) => {
        if (!a.triggerMs) return 1;
        if (!b.triggerMs) return -1;
        return a.triggerMs - b.triggerMs;
      });

      setScheduledAlarms(withTimes);
    } catch (e) {
      console.error('[NotificationsSettings] Failed to inspect alarms', e);
    } finally {
      setLoadingAlarms(false);
    }
  };

  const handleRunDiagnostic = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRunningDiagnostic(true);
    try {
      clearScheduleCache();
      await scheduleAllNotifications({
        tasks,
        customEvents,
        gymLogs,
        attendance,
        habitLogs,
        allHabits,
        assignments,
        waterLogs,
        sleepLogs,
        userGymPlan,
        attendanceLogs,
      }).catch(console.warn);

      const report = await runNotificationDiagnostic();
      Alert.alert('🔬 Notification Diagnostics', report, [
        { text: 'OK' },
        {
          text: 'View Scheduled Alarms',
          onPress: () => handleOpenActiveAlarms(),
        },
      ]);
    } catch (e: any) {
      Alert.alert('Diagnostic Error', e?.message || String(e));
    } finally {
      setRunningDiagnostic(false);
    }
  };

  const BUFFER_OPTIONS = [
    { label: '15 min', val: '15' },
    { label: '30 min', val: '30' },
    { label: '1 hour', val: '60' },
  ];

  const WATER_OPTIONS = [
    { label: 'Off', val: '0' },
    { label: 'Every 1h', val: '1' },
    { label: 'Every 2h', val: '2' },
    { label: 'Every 3h', val: '3' },
  ] as const;

  const Hairline = () => <View style={s.hairline} />;
  const SectionHeader = ({ label }: { label: string }) => (
    <Text style={s.sectionLabel}>{label}</Text>
  );

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── 1. SYSTEM CHECK & DIAGNOSTICS ── */}
        <SectionHeader label="SYSTEM CHECK & DIAGNOSTICS" />
        <View style={s.card}>
          {hasPermission === false && (
            <>
              <TouchableOpacity
                style={s.permissionBanner}
                activeOpacity={0.7}
                onPress={() => Linking.openSettings()}
              >
                <Ionicons name="warning-outline" size={20} color="#EF4444" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.permissionBannerTitle}>
                    Notifications Blocked in Settings
                  </Text>
                  <Text style={s.permissionBannerSub}>
                    Tap to open phone settings and allow notification alerts.
                  </Text>
                </View>
                <Ionicons name="open-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
              <Hairline />
            </>
          )}

          <TouchableOpacity
            style={s.row}
            activeOpacity={0.7}
            onPress={async () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              const { status } = await Notifications.getPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert(
                  'Permission Required',
                  'Notifications are currently blocked by system settings. Please enable them to receive reminders.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Open Settings', onPress: () => Linking.openSettings() },
                  ]
                );
                return;
              }
              await sendTestNotification(user?.displayName || undefined);
              Alert.alert('🔔 Test Sent!', 'ZenTrack posted an immediate test notification to your shade.');
            }}
          >
            <View style={[s.iconBox, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="paper-plane-outline" size={16} color={colors.accentPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Send Test Notification</Text>
              <Text style={s.rowSub}>Verify alarm delivery and device sound</Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
          </TouchableOpacity>

          <Hairline />

          <TouchableOpacity
            style={s.row}
            activeOpacity={0.7}
            onPress={handleOpenActiveAlarms}
          >
            <View
              style={[
                s.iconBox,
                { backgroundColor: isDark ? 'rgba(56,189,248,0.15)' : 'rgba(2,132,199,0.12)' },
              ]}
            >
              <Ionicons
                name="notifications-outline"
                size={16}
                color={isDark ? '#38BDF8' : '#0284C7'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>View Scheduled Alarms</Text>
              <Text style={s.rowSub}>Inspect all active alarms queued in the OS</Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
          </TouchableOpacity>

          <Hairline />

          <TouchableOpacity
            style={s.row}
            activeOpacity={0.7}
            onPress={handleRunDiagnostic}
            disabled={runningDiagnostic}
          >
            <View
              style={[
                s.iconBox,
                { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(217,119,6,0.12)' },
              ]}
            >
              {runningDiagnostic ? (
                <ActivityIndicator size="small" color="#F59E0B" />
              ) : (
                <Ionicons name="pulse-outline" size={16} color="#F59E0B" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Run Diagnostic Check</Text>
              <Text style={s.rowSub}>Test OS trigger pipeline & permissions</Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* ── 2. NOTIFICATION CHANNELS ── */}
        <SectionHeader label="CHANNELS & MODULES" />
        <View style={s.card}>
          <View style={s.row}>
            <View
              style={[
                s.iconBox,
                { backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.12)' },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={16}
                color={colors.accentPrimary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Tasks & Deadlines</Text>
              <Text style={s.rowSub}>Timed missions, daily targets and reminders</Text>
            </View>
            <Switch
              value={modTasks}
              onValueChange={v => toggle('mod_tasks', v, setModTasks)}
              trackColor={{ false: isDark ? '#2c2c30' : '#E2E1EA', true: colors.accentPrimary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={isDark ? '#2c2c30' : '#E2E1EA'}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>

          <Hairline />

          <View style={s.row}>
            <View
              style={[
                s.iconBox,
                { backgroundColor: isDark ? 'rgba(255,159,77,0.15)' : 'rgba(234,88,12,0.12)' },
              ]}
            >
              <Ionicons
                name="flame-outline"
                size={16}
                color={isDark ? '#FF9F4D' : '#EA580C'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Habits & Streaks</Text>
              <Text style={s.rowSub}>Daily check-ins and streak warnings</Text>
            </View>
            <Switch
              value={modHabits}
              onValueChange={v => toggle('mod_habits', v, setModHabits)}
              trackColor={{ false: isDark ? '#2c2c30' : '#E2E1EA', true: colors.accentPrimary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={isDark ? '#2c2c30' : '#E2E1EA'}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>

          <Hairline />

          <View style={s.row}>
            <View
              style={[
                s.iconBox,
                { backgroundColor: isDark ? 'rgba(94,218,158,0.15)' : 'rgba(5,150,105,0.12)' },
              ]}
            >
              <Ionicons
                name="barbell-outline"
                size={16}
                color={isDark ? '#5EDA9E' : '#059669'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Gym & Workouts</Text>
              <Text style={s.rowSub}>Planned workout times and rest day recovery</Text>
            </View>
            <Switch
              value={modGym}
              onValueChange={v => toggle('mod_gym', v, setModGym)}
              trackColor={{ false: isDark ? '#2c2c30' : '#E2E1EA', true: colors.accentPrimary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={isDark ? '#2c2c30' : '#E2E1EA'}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>

          <Hairline />

          <View style={s.row}>
            <View
              style={[
                s.iconBox,
                { backgroundColor: isDark ? 'rgba(251,191,36,0.15)' : 'rgba(217,119,6,0.12)' },
              ]}
            >
              <Ionicons
                name="school-outline"
                size={16}
                color={isDark ? '#FBBF24' : '#D97706'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Classes & Attendance</Text>
              <Text style={s.rowSub}>Class timetable alarms and margin warnings</Text>
            </View>
            <Switch
              value={modAttendance}
              onValueChange={v => toggle('mod_attendance', v, setModAttendance)}
              trackColor={{ false: isDark ? '#2c2c30' : '#E2E1EA', true: colors.accentPrimary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={isDark ? '#2c2c30' : '#E2E1EA'}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>
        </View>

        {/* ── 3. DAILY ROUTINE & TIMING ── */}
        <SectionHeader label="DAILY ROUTINE & TIMING" />
        <View style={s.card}>
          <View style={s.row}>
            <View
              style={[
                s.iconBox,
                { backgroundColor: isDark ? 'rgba(255,159,77,0.15)' : 'rgba(234,88,12,0.12)' },
              ]}
            >
              <Ionicons
                name="sunny-outline"
                size={16}
                color={isDark ? '#FF9F4D' : '#EA580C'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Morning briefing</Text>
              <Text style={s.rowSub}>Summary of today's schedule on wake-up</Text>
            </View>
            <Switch
              value={morningBrief}
              onValueChange={v => toggle('morning_brief', v, setMorningBrief)}
              trackColor={{ false: isDark ? '#2c2c30' : '#E2E1EA', true: colors.accentPrimary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={isDark ? '#2c2c30' : '#E2E1EA'}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>

          {morningBrief && (
            <>
              <Hairline />
              <View style={s.row}>
                <View style={[s.iconBox, { backgroundColor: colors.accentDim }]}>
                  <Ionicons name="time-outline" size={16} color={colors.accentPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>Briefing time</Text>
                </View>
                <TouchableOpacity
                  style={s.timeChip}
                  onPress={() => openPicker('morningBriefTime', morningBriefTime)}
                >
                  <Text style={s.timeChipText}>{displayTime(morningBriefTime)}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Hairline />

          {/* Pre-task Buffer */}
          <View style={s.row}>
            <View style={[s.iconBox, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="hourglass-outline" size={16} color={colors.accentPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Pre-task warning buffer</Text>
              <Text style={s.rowSub}>Alert before a scheduled mission begins</Text>
            </View>
          </View>
          <View style={s.chipRow}>
            {BUFFER_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.val}
                style={[s.chip, taskBuffer === o.val && s.chipActive]}
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTaskBuffer(o.val);
                  await saveString('task_buffer', o.val);
                  reschedule();
                }}
              >
                <Text style={[s.chipText, taskBuffer === o.val && s.chipTextActive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── 4. QUIET HOURS (DO NOT DISTURB) ── */}
        <SectionHeader label="QUIET HOURS (DO NOT DISTURB)" />
        <View style={s.card}>
          <View style={s.row}>
            <View
              style={[
                s.iconBox,
                { backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.12)' },
              ]}
            >
              <Ionicons
                name="moon-outline"
                size={16}
                color={colors.accentPrimary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Mute during sleep</Text>
              <Text style={s.rowSub}>Silence all notifications during quiet hours</Text>
            </View>
            <Switch
              value={quietHours}
              onValueChange={v => toggle('quiet_hours', v, setQuietHours)}
              trackColor={{ false: isDark ? '#2c2c30' : '#E2E1EA', true: colors.accentPrimary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={isDark ? '#2c2c30' : '#E2E1EA'}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>

          {quietHours && (
            <>
              <Hairline />
              <View style={s.row}>
                <View style={[s.iconBox, { backgroundColor: colors.accentDim }]}>
                  <Ionicons name="bed-outline" size={16} color={colors.accentPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>Quiet from</Text>
                </View>
                <TouchableOpacity
                  style={s.timeChip}
                  onPress={() => openPicker('quietStart', quietStart)}
                >
                  <Text style={s.timeChipText}>{displayTime(quietStart)}</Text>
                </TouchableOpacity>
              </View>

              <Hairline />
              <View style={s.row}>
                <View style={[s.iconBox, { backgroundColor: colors.accentDim }]}>
                  <Ionicons name="sunny-outline" size={16} color={colors.accentPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>Quiet until</Text>
                </View>
                <TouchableOpacity
                  style={s.timeChip}
                  onPress={() => openPicker('quietEnd', quietEnd)}
                >
                  <Text style={s.timeChipText}>{displayTime(quietEnd)}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* ── 5. HYDRATION REMINDERS ── */}
        <SectionHeader label="HYDRATION REMINDERS" />
        <View style={s.card}>
          <View style={s.row}>
            <View
              style={[
                s.iconBox,
                { backgroundColor: isDark ? 'rgba(56,189,248,0.15)' : 'rgba(2,132,199,0.12)' },
              ]}
            >
              <Ionicons
                name="water-outline"
                size={16}
                color={isDark ? '#38BDF8' : '#0284C7'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Water reminders</Text>
              <Text style={s.rowSub}>Regular hydration prompts (9 AM – 9 PM)</Text>
            </View>
          </View>
          <View style={s.chipRow}>
            {WATER_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.val}
                style={[s.chip, waterFreq === o.val && s.chipActive]}
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setWaterFreq(o.val);
                  await AsyncStorage.setItem('@zentrack_water_reminder_freq', o.val);
                  reschedule();
                }}
              >
                <Text style={[s.chipText, waterFreq === o.val && s.chipTextActive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Scheduled Alarms Modal */}
      {activeAlarmsModalVisible && (
        <Modal transparent animationType="slide" visible={activeAlarmsModalVisible}>
          <View style={s.pickerModalOverlay}>
            <View style={[s.pickerCard, { maxHeight: '82%', paddingHorizontal: 16 }]}>
              <View style={s.pickerHeader}>
                <View>
                  <Text
                    style={{
                      fontFamily: 'Inter_700Bold',
                      fontSize: 17,
                      color: colors.textPrimary,
                    }}
                  >
                    Scheduled Alarms ({scheduledAlarms.length})
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter_400Regular',
                      fontSize: 12,
                      color: colors.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    Upcoming alarms currently registered in the OS
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={handleOpenActiveAlarms}
                    style={{ padding: 6, marginRight: 8 }}
                    disabled={loadingAlarms}
                  >
                    <Ionicons name="refresh-outline" size={20} color={colors.accentPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setActiveAlarmsModalVisible(false)}
                    style={{ padding: 6 }}
                  >
                    <Ionicons name="close" size={24} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {loadingAlarms ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: 'Inter_500Medium',
                      marginTop: 12,
                    }}
                  >
                    Loading scheduled alarms...
                  </Text>
                </View>
              ) : scheduledAlarms.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={40}
                    color={colors.accentPrimary}
                  />
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontFamily: 'Inter_600SemiBold',
                      marginTop: 12,
                      fontSize: 15,
                    }}
                  >
                    No Active Alarms Queued
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: 'Inter_400Regular',
                      marginTop: 4,
                      fontSize: 12,
                      textAlign: 'center',
                      paddingHorizontal: 20,
                    }}
                  >
                    Alarms are scheduled on-demand when upcoming events, tasks, or water intervals
                    are active.
                  </Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 12 }}>
                  {scheduledAlarms.map((item, idx) => {
                    const nowMs = Date.now();
                    const { label, countdown, isPast } = formatAlarmTrigger(item.triggerMs, nowMs);
                    const cat = getCategoryInfo(item);
                    const title = item.content?.title || 'Notification';
                    const body = item.content?.body || '';

                    return (
                      <View
                        key={item.identifier || idx}
                        style={{
                          backgroundColor: isDark ? '#141416' : '#F5F4FA',
                          borderRadius: 14,
                          padding: 13,
                          marginBottom: 9,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 6,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                              flex: 1,
                              marginRight: 8,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: `${cat.color}22`,
                                paddingHorizontal: 7,
                                paddingVertical: 2.5,
                                borderRadius: 6,
                                gap: 4,
                              }}
                            >
                              <Ionicons name={cat.icon as any} size={11} color={cat.color} />
                              <Text
                                style={{
                                  fontFamily: 'Inter_600SemiBold',
                                  fontSize: 10,
                                  color: cat.color,
                                }}
                              >
                                {cat.tag.toUpperCase()}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontFamily: 'Inter_500Medium',
                                fontSize: 11,
                                color: colors.textTertiary,
                              }}
                              numberOfLines={1}
                            >
                              {label}
                            </Text>
                          </View>

                          <View
                            style={{
                              backgroundColor: isPast
                                ? 'rgba(239,68,68,0.15)'
                                : isDark
                                ? 'rgba(165,153,255,0.15)'
                                : 'rgba(108,92,231,0.12)',
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: 'Inter_600SemiBold',
                                fontSize: 11,
                                color: isPast ? '#EF4444' : colors.accentPrimary,
                              }}
                            >
                              {countdown}
                            </Text>
                          </View>
                        </View>

                        <Text
                          style={{
                            fontFamily: 'Inter_600SemiBold',
                            fontSize: 13,
                            color: colors.textPrimary,
                            marginBottom: 2,
                          }}
                        >
                          {title}
                        </Text>
                        {body ? (
                          <Text
                            style={{
                              fontFamily: 'Inter_400Regular',
                              fontSize: 12,
                              color: colors.textSecondary,
                              lineHeight: 16,
                            }}
                          >
                            {body}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* Native Time Picker */}
      {pickerVisible &&
        (Platform.OS === 'ios' ? (
          <Modal transparent animationType="slide">
            <View style={s.pickerModalOverlay}>
              <View style={s.pickerCard}>
                <View style={s.pickerHeader}>
                  <TouchableOpacity onPress={() => setPickerVisible(false)}>
                    <Text
                      style={{
                        color: colors.accentPrimary,
                        fontSize: 15,
                        fontFamily: 'Inter_500Medium',
                      }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPickerVisible(false)}>
                    <Text
                      style={{
                        color: colors.accentPrimary,
                        fontSize: 15,
                        fontFamily: 'Inter_600SemiBold',
                      }}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  display="spinner"
                  onChange={(e, d) => {
                    if (d) {
                      setPickerDate(d);
                      handlePickerChange(e, d);
                    }
                  }}
                  style={{ height: 200 }}
                  textColor={isDark ? '#FFFFFF' : '#1C1C1E'}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={pickerDate}
            mode="time"
            display="clock"
            onChange={handlePickerChange}
          />
        ))}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    backBtn: {
      padding: 4,
    },
    headerTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 17,
      color: colors.textPrimary,
    },
    scroll: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 40,
    },
    sectionLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      letterSpacing: 0.9,
      color: colors.textTertiary,
      marginBottom: 8,
      marginTop: 12,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 13,
      gap: 12,
    },
    iconBox: {
      width: 32,
      height: 32,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      color: colors.textPrimary,
    },
    rowSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 15,
    },
    hairline: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 60,
    },
    timeChip: {
      backgroundColor: isDark ? '#141416' : '#F5F4FA',
      borderRadius: 9,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    timeChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.accentPrimary,
    },
    chipRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 14,
      paddingTop: 4,
    },
    chip: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: isDark ? '#141416' : '#F5F4FA',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.12)',
      borderColor: colors.accentPrimary,
    },
    chipText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      color: colors.textSecondary,
    },
    chipTextActive: {
      fontFamily: 'Inter_600SemiBold',
      color: colors.accentPrimary,
    },
    permissionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEE2E2',
      borderRadius: 12,
      padding: 12,
      margin: 8,
    },
    permissionBannerTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: '#EF4444',
    },
    permissionBannerSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: isDark ? '#FCA5A5' : '#B91C1C',
      marginTop: 2,
    },
    pickerModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    pickerCard: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      padding: 20,
      width: '100%',
      maxWidth: 380,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pickerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
  });
