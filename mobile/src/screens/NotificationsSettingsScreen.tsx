/**
 * NotificationsSettingsScreen — ZenTrack Mobile
 *
 * Full notification customization:
 *  – Per-module toggles (Tasks, Habits, Gym, Attendance, Focus, Sara)
 *  – 10 smart notification types (habit streak, overdue tasks, assignments, etc.)
 *  – Quiet hours (start + end time)
 *  – Pre-task buffer time (15/30/60/120 min)
 *  – Weekday vs. weekend mode
 *  – Morning briefing time
 *  – Inactivity nudge threshold
 *  – XP milestone toggle
 * All settings persist to AsyncStorage and immediately re-trigger scheduleAllNotifications().
 */

import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  Switch, Platform, Alert, InteractionManager, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { scheduleAllNotifications, clearScheduleCache, sendTestNotification } from '../services/notifications';
import { useMobileData } from '../contexts/MobileDataContext';
import { handleSyncError } from '../utils/errorUtils';



type TimePickerTarget =
  | 'morningBriefTime'
  | 'quietStart'
  | 'quietEnd'
  | 'overdueNudgeTime'
  | 'sleepNight'
  | 'sleepMorning';

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
  if (!hm || !hm.includes(':')) return '--:--';
  const [h, m] = hm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '--:--';
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
}

export default function NotificationsSettingsScreen() {
  const navigation = useNavigation<any>();
  // BUG-2 FIX: Destructure waterLogs and sleepLogs so they can be passed to
  // scheduleAllNotifications() in all call sites below.
  const { tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments, waterLogs, sleepLogs, user } = useMobileData();

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

  // AI & Actions
  const [saraEscalation,     setSaraEscalation]     = useState(true);
  const [actionableNotifs,   setActionableNotifs]   = useState(true);
  const [habitStacking,      setHabitStacking]      = useState(true);

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

  // Wellness — Sleep
  const [sleepRemindersEnabled, setSleepRemindersEnabled] = useState(false);
  const [sleepNightTime,        setSleepNightTime]        = useState('22:00');
  const [sleepMorningTime,      setSleepMorningTime]      = useState('07:00');
  // Wellness — Water
  const [waterFreq,             setWaterFreq]             = useState('0'); // 0 = disabled

  // Time picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<TimePickerTarget>('morningBriefTime');
  const [pickerDate, setPickerDate] = useState(new Date());

  // Load all settings fast to prevent transition stutter
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          const zentrackKeys = [
            'mod_tasks', 'mod_habits', 'mod_gym', 'mod_attendance', 'mod_focus',
            'habit_streak_risk', 'overdue_nudge', 'assignment_48h', 'assignment_24h', 'gym_rest_day',
            'weekly_review', 'attendance_warning', 'morning_brief', 'inactivity_nudge', 'xp_milestone',
            'quiet_hours', 'weekend_mode', 'sara_escalation', 'actionable_notifs', 'habit_stacking',
            'morning_brief_time', 'overdue_nudge_time', 'quiet_start', 'quiet_end', 'task_buffer', 'inactivity_days', 'habit_streak_time'
          ].map(KEY);
          // BUG-1 FIX: Load wellness keys (sleep + water) alongside other prefs.
          // Previously these keys were never loaded or displayed in the UI.
          const wellnessKeys = [
            '@zentrack_sleep_reminders_enabled',
            '@zentrack_sleep_reminder_night',
            '@zentrack_sleep_reminder_morning',
            '@zentrack_water_reminder_freq',
          ];

          const results = await AsyncStorage.multiGet([...zentrackKeys, ...wellnessKeys]);
          const dict = Object.fromEntries(results);

          const getB = (k: string, def = true) => dict[KEY(k)] === null || dict[KEY(k)] === undefined ? def : dict[KEY(k)] === 'true';
          const getS = (k: string, def: string) => dict[KEY(k)] ?? def;
          const rawGet = (k: string, def: string) => dict[k] ?? def;

          setModTasks(      getB('mod_tasks'));
          setModHabits(     getB('mod_habits'));
          setModGym(        getB('mod_gym'));
          setModAttendance( getB('mod_attendance'));
          setModFocus(      getB('mod_focus'));

          setHabitStreakAtRisk(  getB('habit_streak_risk'));
          setOverdueNudge(       getB('overdue_nudge'));
          setAssignmentAlert48h( getB('assignment_48h'));
          setAssignmentAlert24h( getB('assignment_24h'));
          setGymRestDay(         getB('gym_rest_day', false));
          setWeeklyReview(       getB('weekly_review'));
          setAttendanceWarning(  getB('attendance_warning'));
          setMorningBrief(       getB('morning_brief'));
          setInactivityNudge(    getB('inactivity_nudge'));
          setXpMilestone(        getB('xp_milestone'));
          setQuietHours(         getB('quiet_hours'));
          setWeekendMode(        getB('weekend_mode', false));
          
          setSaraEscalation(     getB('sara_escalation', true));
          setActionableNotifs(   getB('actionable_notifs', true));
          setHabitStacking(      getB('habit_stacking', true));

          setMorningBriefTime(  getS('morning_brief_time', '07:30'));
          setOverdueNudgeTime(  getS('overdue_nudge_time', '08:00'));
          setQuietStart(        getS('quiet_start', '23:00'));
          setQuietEnd(          getS('quiet_end', '07:00'));
          setTaskBuffer(        getS('task_buffer', '60'));
          setInactivityDays(    getS('inactivity_days', '3'));
          setHabitStreakTime(   getS('habit_streak_time', '20:00'));

          // BUG-1 FIX: Load wellness notification prefs
          setSleepRemindersEnabled(rawGet('@zentrack_sleep_reminders_enabled', 'false') === 'true');
          setSleepNightTime(        rawGet('@zentrack_sleep_reminder_night',    '22:00'));
          setSleepMorningTime(      rawGet('@zentrack_sleep_reminder_morning',  '07:00'));
          setWaterFreq(             rawGet('@zentrack_water_reminder_freq',     '0'));
        } catch {}
      })();
    });
    return () => task.cancel();
  }, []);

  // BUG-2 FIX: Helper that passes the full data set (incl. waterLogs + sleepLogs)
  // to scheduleAllNotifications so wellness notifications are not dropped.
  // BUG-4 FIX: clearScheduleCache() ensures the fingerprint cache doesn't
  // short-circuit the reschedule when only a pref changed (not data).
  const reschedule = useCallback(() => {
    clearScheduleCache();
    scheduleAllNotifications({
      tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments,
      waterLogs, sleepLogs,
    }).catch(console.warn);
  }, [tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments, waterLogs, sleepLogs]);

  // Toggle helper — saves + reschedules
  const toggle = useCallback(async (key: string, val: boolean, setter: (v: boolean) => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setter(val);
    await saveBool(key, val);
    reschedule();
  }, [reschedule]);

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
      // BUG-1 FIX: handle wellness time targets
      case 'sleepNight':   setSleepNightTime(hm);   await AsyncStorage.setItem('@zentrack_sleep_reminder_night',   hm); break;
      case 'sleepMorning': setSleepMorningTime(hm); await AsyncStorage.setItem('@zentrack_sleep_reminder_morning', hm); break;
    }
    // BUG-2 + BUG-4 FIX: use reschedule() so all data (incl. wellness) is passed and cache is cleared
    reschedule();
  };

  const closePicker = () => setPickerVisible(false);

  // Buffer options
  const BUFFER_OPTIONS = [{ label: '15 min', val: '15' }, { label: '30 min', val: '30' }, { label: '1 hr', val: '60' }, { label: '2 hr', val: '120' }];
  const INACTIVITY_OPTIONS = [{ label: '2 days', val: '2' }, { label: '3 days', val: '3' }, { label: '5 days', val: '5' }, { label: '7 days', val: '7' }];

  const ToggleRow = ({ icon, label, subtitle, value, onToggle, iconColor = COLORS.accentPrimary }: {
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
        trackColor={{ false: COLORS.surfaceRaised, true: COLORS.accentPrimary }}
        thumbColor={'#000000'}
        ios_backgroundColor={COLORS.surfaceRaised}
        style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] }}
      />
    </View>
  );

  const TimeRow = ({ icon, label, value, target }: {
    icon: string; label: string; value: string; target: TimePickerTarget;
  }) => (
    <View style={s.row}>
      <View style={[s.iconBox, { backgroundColor: COLORS.accentDim }]}>
        <Ionicons name={icon as any} size={15} color={COLORS.accentPrimary} />
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
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.accentPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* TEST & VERIFY */}
        <SectionHeader label="SYSTEM CHECK" />
        <View style={[s.card, { marginBottom: 8 }]}>
          <TouchableOpacity 
            style={s.row} 
            activeOpacity={0.7} 
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              sendTestNotification(user?.displayName || undefined);
            }}
          >
            <View style={[s.iconBox, { backgroundColor: 'rgba(165,153,255,0.15)' }]}>
              <Ionicons name="paper-plane-outline" size={15} color={COLORS.accentPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Send Test Notification</Text>
              <Text style={s.rowSub}>Verify S.A.R.A comms are working</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
          </TouchableOpacity>
        </View>

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

        {/* AI & ACTIONS */}
        <SectionHeader label="S.A.R.A. & ACTIONS" />
        <View style={s.card}>
          <ToggleRow
            icon="hardware-chip-outline"
            label="S.A.R.A. Tone Escalation"
            subtitle="Strict AI responses if you slack off"
            value={saraEscalation}
            onToggle={v => toggle('sara_escalation', v, setSaraEscalation)}
            iconColor="#ff3b30"
          />
          <Hairline />
          <ToggleRow
            icon="finger-print-outline"
            label="Actionable Notifications"
            subtitle="Zero-click lock screen buttons"
            value={actionableNotifs}
            onToggle={v => toggle('actionable_notifs', v, setActionableNotifs)}
          />
          <Hairline />
          <ToggleRow
            icon="sync-circle-outline"
            label="Smart Habit Stacking"
            subtitle="Context-aware nudges (e.g., after focus)"
            value={habitStacking}
            onToggle={v => toggle('habit_stacking', v, setHabitStacking)}
            iconColor="#64b5f6"
          />
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
            iconColor={COLORS.accentPrimary}
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
            <View style={[s.iconBox, { backgroundColor: COLORS.accentDim }]}>
              <Ionicons name="hourglass-outline" size={15} color={COLORS.accentPrimary} />
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
                  // BUG-2 + BUG-4 FIX: use reschedule() helper
                  reschedule();
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
            subtitle={`No notifications ${displayTime(quietStart)} – ${displayTime(quietEnd)}`}
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
            <View style={[s.iconBox, { backgroundColor: COLORS.accentDim }]}>
              <Ionicons name="bed-outline" size={15} color={COLORS.accentPrimary} />
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

        {/* ── WELLNESS REMINDERS ─────────────────────────────────────────────
             BUG-1 FIX: These sections were missing entirely. The AsyncStorage
             keys for water/sleep were never written so notifications.ts always
             saw waterReminderFreq=0 (skips water) and sleepRemindersEnabled=false
             (skips sleep). Now users can actually configure these features.
        ── */}
        <SectionHeader label="WELLNESS REMINDERS" />

        {/* Sleep Reminders */}
        <View style={s.card}>
          <ToggleRow
            icon="moon-outline"
            label="Sleep reminders"
            subtitle="Wind-down at night + log-sleep in morning"
            value={sleepRemindersEnabled}
            iconColor="#89dceb"
            onToggle={async (v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSleepRemindersEnabled(v);
              await AsyncStorage.setItem('@zentrack_sleep_reminders_enabled', v.toString());
              reschedule();
            }}
          />
          {sleepRemindersEnabled && (
            <>
              <Hairline />
              <View style={s.row}>
                <View style={[s.iconBox, { backgroundColor: 'rgba(137,220,235,0.12)' }]}>
                  <Ionicons name="bed-outline" size={15} color="#89dceb" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>Bedtime reminder</Text>
                  <Text style={s.rowSub}>"Wind down and log your sleep"</Text>
                </View>
                <TouchableOpacity style={s.timeChip} onPress={() => openPicker('sleepNight', sleepNightTime)}>
                  <Text style={s.timeChipText}>{displayTime(sleepNightTime)}</Text>
                </TouchableOpacity>
              </View>
              <Hairline />
              <View style={s.row}>
                <View style={[s.iconBox, { backgroundColor: 'rgba(137,220,235,0.12)' }]}>
                  <Ionicons name="sunny-outline" size={15} color="#89dceb" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>Morning sleep log</Text>
                  <Text style={s.rowSub}>"How did you sleep last night?"</Text>
                </View>
                <TouchableOpacity style={s.timeChip} onPress={() => openPicker('sleepMorning', sleepMorningTime)}>
                  <Text style={s.timeChipText}>{displayTime(sleepMorningTime)}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Water Reminders */}
        <View style={[s.card, { marginTop: 8 }]}>
          <View style={s.row}>
            <View style={[s.iconBox, { backgroundColor: 'rgba(94,218,158,0.12)' }]}>
              <Ionicons name="water-outline" size={15} color="#5eda9e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Water reminder frequency</Text>
              <Text style={s.rowSub}>Reminders from 9 AM – 9 PM</Text>
            </View>
          </View>
          <View style={s.chipRow}>
            {([{ label: 'Off', val: '0' }, { label: 'Every 1h', val: '1' }, { label: 'Every 2h', val: '2' }, { label: 'Every 3h', val: '3' }] as const).map(o => (
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
                <Text style={[s.chipText, waterFreq === o.val && s.chipTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
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
                    <Text style={{ color: COLORS.accentPrimary, fontSize: 15 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={closePicker}>
                    <Text style={{ color: COLORS.accentPrimary, fontSize: 15, fontWeight: '600' }}>Done</Text>
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
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
    color: COLORS.textPrimary,
  },
  scroll: { padding: 16 },

  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: COLORS.textTertiary,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 20,
    marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
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
    color: COLORS.textPrimary,
    marginBottom: 1,
  },
  rowSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.textMuted,
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
    color: COLORS.accentPrimary,
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
  chipActive: { backgroundColor: COLORS.accentPrimary },
  chipText: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: COLORS.textMuted },
  chipTextActive: { color: '#000000', fontFamily: 'Inter_600SemiBold' },

  pickerModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)',
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
