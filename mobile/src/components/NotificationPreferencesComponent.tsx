/**
 * NotificationsSettingsScreen • ZenTrack Mobile
 *
 * Full notification customization:
 *  • Per-module toggles (Tasks, Habits, Gym, Attendance, Focus, Sara)
 *  • 10 smart notification types (habit streak, overdue tasks, assignments, etc.)
 *  • Quiet hours (start + end time)
 *  • Pre-task buffer time (15/30/60/120 min)
 *  • Weekday vs. weekend mode
 *  • Morning briefing time
 *  • Inactivity nudge threshold
 *  • XP milestone toggle
 * All settings persist to AsyncStorage and immediately re-trigger scheduleAllNotifications().
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity,
  Alert, Platform, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { scheduleAllNotifications } from '../services/notifications';
import { useMobileData } from '../contexts/MobileDataContext';
import { useTheme } from "../contexts/ThemeContext";
import { handleSyncError } from '../utils/errorUtils';


type TimePickerTarget =
  | 'morningBriefTime'
  | 'quietStart'
  | 'quietEnd'
  | 'overdueNudgeTime';

// Storage key helpers
const KEY = (k: string) => `zentrack_notif_${k}`;

async function loadBool(key: string, def = true): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEY(key));
  return v === null ? def : v === 'true';
}
async function saveBool(key: string, val: boolean) {
  await AsyncStorage.setItem(KEY(key), val.toString());
}
async function loadString(key: string, def: string): Promise<string> {
  return (await AsyncStorage.getItem(KEY(key))) ?? def;
}
async function saveString(key: string, val: string) {
  await AsyncStorage.setItem(KEY(key), val);
}

function parseHM(s: string) {
  const [h, m] = s.split(':').map(Number);
  const d = new Date();
  d.setHours(isNaN(h) ? 9 : h, isNaN(m) ? 0 : m, 0, 0);
  return d;
}
function toHM(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}
function displayTime(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
}

export default function NotificationPreferencesComponent() {
    const { colors, isDark } = useTheme();
    const s = makeStyles(colors);
  const navigation = useNavigation<any>();
  const { tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments } = useMobileData();

  // Module toggles
  const [modTasks,      setModTasks]      = useState(true);
  const [modHabits,     setModHabits]     = useState(true);
  const [modGym,        setModGym]        = useState(true);
  const [modAttendance, setModAttendance] = useState(true);
  const [modFocus,      setModFocus]      = useState(true);

  // Smart notification types
  const [habitStreakAtRisk,  setHabitStreakAtRisk]  = useState(true);
  const [overdueNudge,       setOverdueNudge]       = useState(true);
  const [assignmentAlert48h, setAssignmentAlert48h] = useState(true);
  const [assignmentAlert24h, setAssignmentAlert24h] = useState(true);
  const [gymRestDay,         setGymRestDay]         = useState(false);
  const [weeklyReview,       setWeeklyReview]       = useState(true);
  const [attendanceWarning,  setAttendanceWarning]  = useState(true);
  const [morningBrief,       setMorningBrief]       = useState(true);
  const [inactivityNudge,    setInactivityNudge]    = useState(true);
  const [xpMilestone,        setXpMilestone]        = useState(true);

  // Timing configs
  const [morningBriefTime,   setMorningBriefTime]   = useState('07:30');
  const [overdueNudgeTime,   setOverdueNudgeTime]   = useState('08:00');
  const [quietStart,         setQuietStart]         = useState('23:00');
  const [quietEnd,           setQuietEnd]           = useState('07:00');
  const [quietHours,         setQuietHours]         = useState(true);
  const [taskBuffer,         setTaskBuffer]         = useState('60'); // minutes
  const [weekendMode,        setWeekendMode]        = useState(false);
  const [inactivityDays,     setInactivityDays]     = useState('3');
  const [habitStreakTime,    setHabitStreakTime]     = useState('20:00'); // 8pm

  // Advanced toggles
  const [saraToneStrict, setSaraToneStrict] = useState(false);
  const [locationNotifs, setLocationNotifs] = useState(false);
  const [actionableNotifs, setActionableNotifs] = useState(true);
  const [habitStackNotifs, setHabitStackNotifs] = useState(true);
  const [notifSound, setNotifSound] = useState('default');

  // Time picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<TimePickerTarget>('morningBriefTime');
  const [pickerDate, setPickerDate] = useState(new Date());

  // Load all settings
  useEffect(() => {
    (async () => {
      try {
        setModTasks(      await loadBool('mod_tasks'));
        setModHabits(     await loadBool('mod_habits'));
        setModGym(        await loadBool('mod_gym'));
        setModAttendance( await loadBool('mod_attendance'));
        setModFocus(      await loadBool('mod_focus'));

        setHabitStreakAtRisk(  await loadBool('habit_streak_risk'));
        setOverdueNudge(       await loadBool('overdue_nudge'));
        setAssignmentAlert48h( await loadBool('assignment_48h'));
        setAssignmentAlert24h( await loadBool('assignment_24h'));
        setGymRestDay(         await loadBool('gym_rest_day', false));
        setWeeklyReview(       await loadBool('weekly_review'));
        setAttendanceWarning(  await loadBool('attendance_warning'));
        setMorningBrief(       await loadBool('morning_brief'));
        setInactivityNudge(    await loadBool('inactivity_nudge'));
        setXpMilestone(        await loadBool('xp_milestone'));
        setQuietHours(         await loadBool('quiet_hours'));
        setWeekendMode(        await loadBool('weekend_mode', false));

        setMorningBriefTime(  await loadString('morning_brief_time', '07:30'));
        setOverdueNudgeTime(  await loadString('overdue_nudge_time', '08:00'));
        setQuietStart(        await loadString('quiet_start', '23:00'));
        setQuietEnd(          await loadString('quiet_end', '07:00'));
        setTaskBuffer(        await loadString('task_buffer', '60'));
        setInactivityDays(    await loadString('inactivity_days', '3'));
        setHabitStreakTime(   await loadString('habit_streak_time', '20:00'));

        setSaraToneStrict(    await loadBool('sara_tone', false));
        setLocationNotifs(    await loadBool('location_notifs', false));
        setActionableNotifs(  await loadBool('actionable_notifs', true));
        setHabitStackNotifs(  await loadBool('habit_stack_notifs', true));
        setNotifSound(        await loadString('notifs_sound', 'default'));
      } catch {}
    })();
  }, []);

  // Toggle helper • saves + reschedules
  const toggle = useCallback(async (key: string, val: boolean, setter: (v: boolean) => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setter(val);
    await saveBool(key, val);
    scheduleAllNotifications({
      tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments,
    }).catch(console.warn);
  }, [tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments]);

  // Time picker helpers
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
      case 'morningBriefTime':   setMorningBriefTime(hm);  await saveString('morning_brief_time', hm);  break;
      case 'quietStart':         setQuietStart(hm);         await saveString('quiet_start', hm);          break;
      case 'quietEnd':           setQuietEnd(hm);           await saveString('quiet_end', hm);            break;
      case 'overdueNudgeTime':   setOverdueNudgeTime(hm);  await saveString('overdue_nudge_time', hm);   break;
    }
    scheduleAllNotifications({ tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments }).catch(console.warn);
  };

  const closePicker = () => setPickerVisible(false);

  const handleSelectSound = async (soundName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotifSound(soundName);
    await saveString('notifs_sound', soundName);
    
    try {
      if (soundName === 'chime.wav') {
        const { sound } = await Audio.Sound.createAsync(require('../../assets/sounds/chime.wav'));
        await sound.playAsync();
      } else if (soundName === 'alert.wav') {
        const { sound } = await Audio.Sound.createAsync(require('../../assets/sounds/alert.wav'));
        await sound.playAsync();
      } else if (soundName === 'heavy.wav') {
        const { sound } = await Audio.Sound.createAsync(require('../../assets/sounds/heavy.wav'));
        await sound.playAsync();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.log('Error playing sound preview', e);
    }
  };

  // Buffer options
  const BUFFER_OPTIONS = [{ label: '15 min', val: '15' }, { label: '30 min', val: '30' }, { label: '1 hr', val: '60' }, { label: '2 hr', val: '120' }];
  const INACTIVITY_OPTIONS = [{ label: '2 days', val: '2' }, { label: '3 days', val: '3' }, { label: '5 days', val: '5' }, { label: '7 days', val: '7' }];

  const ToggleRow = ({ icon, label, subtitle, value, onToggle, iconColor = colors.accentPrimary }: {
    icon: string; label: string; subtitle?: string; value: boolean; onToggle: (v: boolean) => void; iconColor?: string;
  }) => (
    <View style={s.row}>
      <View style={[s.iconBox, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon as any} size={15} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{label}</Text>
        {subtitle && <Text style={s.rowSub}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.surfaceRaised, true: colors.accentPrimary }}
        thumbColor={'#000000'}
        ios_backgroundColor={colors.surfaceRaised}
        style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] }}
      />
    </View>
  );

  const TimeRow = ({ icon, label, value, target }: {
    icon: string; label: string; value: string; target: TimePickerTarget;
  }) => (
    <View style={s.row}>
      <View style={[s.iconBox, { backgroundColor: colors.accentDim }]}>
        <Ionicons name={icon as any} size={15} color={colors.accentPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{label}</Text>
      </View>
      <TouchableOpacity style={s.timeChip} onPress={() => openPicker(target, value)}>
        <Text style={s.timeChipText}>{displayTime(value)}</Text>
      </TouchableOpacity>
    </View>
  );

  const SectionHeader = ({ label }: { label: string }) => (
    <Text style={s.sectionLabel}>{label}</Text>
  );

  const Hairline = () => <View style={s.hairline} />;

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.accentPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* MODULE TOGGLES */}
        <SectionHeader label="BY MODULE" />
        <View style={s.card}>
          <ToggleRow icon="checkmark-circle-outline" label="Tasks" subtitle="Task warnings and overdue nudges" value={modTasks} onToggle={v => toggle('mod_tasks', v, setModTasks)} />
          <Hairline />
          <ToggleRow icon="flame-outline" label="Habits" subtitle="Streak risk and completion reminders" value={modHabits} onToggle={v => toggle('mod_habits', v, setModHabits)} iconColor="#ff9f4d" />
          <Hairline />
          <ToggleRow icon="barbell-outline" label="Gym" subtitle="Workout and rest day reminders" value={modGym} onToggle={v => toggle('mod_gym', v, setModGym)} iconColor="#5eda9e" />
          <Hairline />
          <ToggleRow icon="clipboard-outline" label="Attendance" subtitle="Low attendance warnings" value={modAttendance} onToggle={v => toggle('mod_attendance', v, setModAttendance)} iconColor="#ff6961" />
          <Hairline />
          <ToggleRow icon="timer-outline" label="Focus" subtitle="Focus session completion alerts" value={modFocus} onToggle={v => toggle('mod_focus', v, setModFocus)} iconColor="#64b5f6" />
        </View>

        {/* SMART NOTIFICATIONS */}
        <SectionHeader label="SMART NOTIFICATIONS" />
        <View style={s.card}>
          <ToggleRow
            icon="trending-up-outline"
            label="Habit streak at risk"
            subtitle={`Alerts at ${displayTime(habitStreakTime)} if habit unlogged`}
            value={habitStreakAtRisk && modHabits}
            onToggle={v => toggle('habit_streak_risk', v, setHabitStreakAtRisk)}
            iconColor="#ff9f4d"
          />
          <Hairline />
          <ToggleRow
            icon="alert-circle-outline"
            label="Overdue task nudge"
            subtitle={`Sent at ${displayTime(overdueNudgeTime)} for pending tasks`}
            value={overdueNudge && modTasks}
            onToggle={v => toggle('overdue_nudge', v, setOverdueNudge)}
          />
          <Hairline />
          <ToggleRow
            icon="book-outline"
            label="Assignment due in 48 hours"
            subtitle="Early warning for upcoming deadlines"
            value={assignmentAlert48h && modAttendance}
            onToggle={v => toggle('assignment_48h', v, setAssignmentAlert48h)}
            iconColor="#ff9f4d"
          />
          <Hairline />
          <ToggleRow
            icon="time-outline"
            label="Assignment due in 24 hours"
            subtitle="Final reminder for deadlines"
            value={assignmentAlert24h && modAttendance}
            onToggle={v => toggle('assignment_24h', v, setAssignmentAlert24h)}
            iconColor="#ff6961"
          />
          <Hairline />
          <ToggleRow
            icon="walk-outline"
            label="Gym rest day reminder"
            subtitle="Recovery nudge on planned rest days"
            value={gymRestDay && modGym}
            onToggle={v => toggle('gym_rest_day', v, setGymRestDay)}
            iconColor="#5eda9e"
          />
          <Hairline />
          <ToggleRow
            icon="calendar-outline"
            label="Weekly review reminder"
            subtitle="Sunday evening reflection prompt"
            value={weeklyReview}
            onToggle={v => toggle('weekly_review', v, setWeeklyReview)}
            iconColor={colors.accentPrimary}
          />
          <Hairline />
          <ToggleRow
            icon="school-outline"
            label="Attendance warning"
            subtitle="When attendance drops below threshold"
            value={attendanceWarning && modAttendance}
            onToggle={v => toggle('attendance_warning', v, setAttendanceWarning)}
            iconColor="#ff6961"
          />
          <Hairline />
          <ToggleRow
            icon="sunny-outline"
            label="Morning briefing"
            subtitle={`Daily summary at ${displayTime(morningBriefTime)}`}
            value={morningBrief}
            onToggle={v => toggle('morning_brief', v, setMorningBrief)}
            iconColor="#ff9f4d"
          />
          <Hairline />
          <ToggleRow
            icon="moon-outline"
            label="Inactivity nudge"
            subtitle={`After ${inactivityDays} days without logging`}
            value={inactivityNudge}
            onToggle={v => toggle('inactivity_nudge', v, setInactivityNudge)}
          />
          <Hairline />
          <ToggleRow
            icon="star-outline"
            label="XP milestone alert"
            subtitle="Celebrate when you level up"
            value={xpMilestone}
            onToggle={v => toggle('xp_milestone', v, setXpMilestone)}
            iconColor="#a599ff"
          />
        </View>

        {/* TIMING CONFIG */}
        <SectionHeader label="TIMING" />
        <View style={s.card}>
          <TimeRow icon="sunny-outline"     label="Morning briefing time" value={morningBriefTime} target="morningBriefTime" />
          <Hairline />
          <TimeRow icon="alert-circle-outline" label="Overdue nudge time" value={overdueNudgeTime} target="overdueNudgeTime" />
          <Hairline />
          <View style={s.row}>
            <View style={[s.iconBox, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="hourglass-outline" size={15} color={colors.accentPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Pre-task reminder buffer</Text>
              <Text style={s.rowSub}>How early to fire task warnings</Text>
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
                  scheduleAllNotifications({ tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments }).catch(console.warn);
                }}
              >
                <Text style={[s.chipText, taskBuffer === o.val && s.chipTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* QUIET HOURS */}
        <SectionHeader label="QUIET HOURS" />
        <View style={s.card}>
          <ToggleRow
            icon="volume-mute-outline"
            label="Enable quiet hours"
            subtitle={`No notifications ${displayTime(quietStart)} • ${displayTime(quietEnd)}`}
            value={quietHours}
            onToggle={v => toggle('quiet_hours', v, setQuietHours)}
          />
          {quietHours && (
            <>
              <Hairline />
              <TimeRow icon="moon-outline"  label="Quiet from" value={quietStart} target="quietStart" />
              <Hairline />
              <TimeRow icon="sunny-outline" label="Quiet until" value={quietEnd}   target="quietEnd"   />
            </>
          )}
        </View>

        {/* INACTIVITY + WEEKEND */}
        <SectionHeader label="BEHAVIOR" />
        <View style={s.card}>
          <View style={s.row}>
            <View style={[s.iconBox, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="bed-outline" size={15} color={colors.accentPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Inactivity threshold</Text>
              <Text style={s.rowSub}>Days before inactivity nudge fires</Text>
            </View>
          </View>
          <View style={s.chipRow}>
            {INACTIVITY_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.val}
                style={[s.chip, inactivityDays === o.val && s.chipActive]}
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setInactivityDays(o.val);
                  await saveString('inactivity_days', o.val);
                }}
              >
                <Text style={[s.chipText, inactivityDays === o.val && s.chipTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Hairline />
          <ToggleRow
            icon="sunny-outline"
            label="Weekend mode"
            subtitle="Reduced notifications on Sat/Sun"
            value={weekendMode}
            onToggle={v => toggle('weekend_mode', v, setWeekendMode)}
            iconColor="#ff9f4d"
          />
        </View>

        {/* ADVANCED */}
        <SectionHeader label="ADVANCED & SOUNDS" />
        <View style={s.card}>
          <ToggleRow
            icon="chatbubbles-outline"
            label="Strict S.A.R.A Persona"
            subtitle="Tone escalation for missed habits & classes"
            value={saraToneStrict}
            onToggle={v => toggle('sara_tone', v, setSaraToneStrict)}
          />
          <Hairline />
          <ToggleRow
            icon="location-outline"
            label="Location Triggers"
            subtitle="Geofencing alerts (e.g., Gym arrival)"
            value={locationNotifs}
            onToggle={v => toggle('location_notifs', v, setLocationNotifs)}
          />
          <Hairline />
          <ToggleRow
            icon="hand-left-outline"
            label="Actionable Alerts"
            subtitle="Zero-click logging from push notifications"
            value={actionableNotifs}
            onToggle={v => toggle('actionable_notifs', v, setActionableNotifs)}
          />
          <Hairline />
          <ToggleRow
            icon="layers-outline"
            label="Smart Habit Stacking"
            subtitle="Context-aware follow-up reminders"
            value={habitStackNotifs}
            onToggle={v => toggle('habit_stack_notifs', v, setHabitStackNotifs)}
          />
          <Hairline />
          <View style={s.row}>
            <View style={[s.iconBox, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="musical-notes-outline" size={15} color={colors.accentPrimary} />
            </View>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={s.rowTitle}>Notification Sound</Text>
              <Text style={s.rowSub}>Requires standalone build to apply</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
              {['default', 'chime.wav', 'alert.wav', 'heavy.wav'].map(sName => {
                const isSelected = notifSound === sName;
                return (
                  <TouchableOpacity 
                    key={sName}
                    onPress={() => handleSelectSound(sName)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 12,
                      backgroundColor: isSelected ? colors.accentPrimary : 'transparent',
                      borderWidth: 1,
                      borderColor: isSelected ? colors.accentPrimary : '#2c2c2e'
                    }}
                  >
                    <Text style={{ 
                      fontSize: 11, 
                      fontWeight: '600', 
                      color: isSelected ? '#000' : colors.textPrimary,
                      textTransform: 'capitalize' 
                    }}>
                      {sName.replace('.wav', '')}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Time Picker Modal */}
      {pickerVisible && (
        Platform.OS === 'ios' ? (
          <Modal transparent animationType="slide">
            <View style={s.pickerModalOverlay}>
              <View style={s.pickerCard}>
                <View style={s.pickerHeader}>
                  <TouchableOpacity onPress={closePicker}>
                    <Text style={{ color: colors.accentPrimary, fontSize: 15 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={closePicker}>
                    <Text style={{ color: colors.accentPrimary, fontSize: 15, fontWeight: '600' }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  display="spinner"
                  onChange={(e, d) => { if (d) { setPickerDate(d); handlePickerChange(e, d); } }}
                  style={{ height: 200 }}
                  textColor="#ffffff"
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
        )
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.background },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#1c1c1e',
      },
      backBtn: {
        width: 44, height: 44,
        alignItems: 'center',
        justifyContent: 'center',
      },
      headerTitle: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 16,
        color: colors.textPrimary,
      },
      scroll: { padding: 16 },

      sectionLabel: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 11,
        color: colors.textTertiary,
        letterSpacing: 0.8,
        marginBottom: 8,
        marginTop: 20,
        marginLeft: 4,
      },
      card: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#2c2c2e',
        overflow: 'hidden',
      },
      row: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        paddingHorizontal: 16,
        gap: 12,
      },
      iconBox: {
        width: 30, height: 30, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center',
      },
      rowTitle: {
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        color: colors.textPrimary,
        marginBottom: 1,
      },
      rowSub: {
        fontFamily: 'Inter_400Regular',
        fontSize: 11,
        color: colors.textMuted,
        lineHeight: 15,
      },
      hairline: { height: StyleSheet.hairlineWidth, backgroundColor: '#1c1c1e', marginLeft: 58 },

      timeChip: {
        backgroundColor: '#2c2c2e',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
      },
      timeChipText: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 13,
        color: colors.accentPrimary,
      },

      chipRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 14,
      },
      chip: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        backgroundColor: '#2c2c2e',
      },
      chipActive: { backgroundColor: colors.accentPrimary },
      chipText: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: colors.textMuted },
      chipTextActive: { color: '#000000', fontFamily: 'Inter_600SemiBold' },

      pickerModalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
      },
      pickerCard: {
        backgroundColor: '#1c1c1e',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 34,
      },
      pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#2c2c2e',
      },
    });
