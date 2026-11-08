/**
 * NotificationsSettingsScreen • ZenTrack Mobile
 *
 * Full notification customization:
 *  • Per-module toggles (Tasks, Habits, Attendance, Focus)
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
  Alert, Platform, Modal, InteractionManager
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { scheduleAllNotifications, clearScheduleCache } from '../services/notifications';
import { ensureNotificationChannels } from '../services/notificationChannels';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { usePlannerData } from '../contexts/domains/PlannerContext';
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

const rowStyles = StyleSheet.create({
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
    marginBottom: 1,
  },
  rowSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 15,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 58,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 20,
    marginLeft: 4,
  },
  timeChip: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timeChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
});

const ToggleRow = React.memo(function ToggleRow({
  icon,
  label,
  subtitle,
  value,
  onToggle,
  iconColor,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  iconColor?: string;
}) {
  const { colors, isDark } = useTheme();
  const effectiveIconColor = iconColor || colors.accentPrimary;

  return (
    <View style={rowStyles.row}>
      <View style={[rowStyles.iconBox, { backgroundColor: `${effectiveIconColor}18` }]}>
        <Ionicons name={icon as any} size={15} color={effectiveIconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[rowStyles.rowTitle, { color: colors.textPrimary }]}>{label}</Text>
        {subtitle && <Text style={[rowStyles.rowSub, { color: colors.textMuted }]}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: isDark ? colors.surfaceRaised : (colors.surface2 || '#e5e5ea'), true: colors.accentPrimary }}
        thumbColor={Platform.OS === 'android' ? (value ? '#ffffff' : (isDark ? '#e0e0e0' : '#ffffff')) : undefined}
        ios_backgroundColor={isDark ? colors.surfaceRaised : (colors.surface2 || '#e5e5ea')}
        style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] }}
      />
    </View>
  );
});

const TimeRow = React.memo(function TimeRow({
  icon,
  label,
  value,
  target,
  onOpenPicker,
}: {
  icon: string;
  label: string;
  value: string;
  target: TimePickerTarget;
  onOpenPicker: (target: TimePickerTarget, val: string) => void;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View style={rowStyles.row}>
      <View style={[rowStyles.iconBox, { backgroundColor: colors.accentDim }]}>
        <Ionicons name={icon as any} size={15} color={colors.accentPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[rowStyles.rowTitle, { color: colors.textPrimary }]}>{label}</Text>
      </View>
      <TouchableOpacity
        style={[rowStyles.timeChip, { backgroundColor: isDark ? '#2c2c2e' : (colors.surface2 || '#e5e5ea') }]}
        onPress={() => onOpenPicker(target, value)}
      >
        <Text style={[rowStyles.timeChipText, { color: colors.accentPrimary }]}>{displayTime(value)}</Text>
      </TouchableOpacity>
    </View>
  );
});

const SectionHeader = React.memo(function SectionHeader({ label }: { label: string }) {
  const { colors } = useTheme();
  return <Text style={[rowStyles.sectionLabel, { color: colors.textTertiary }]}>{label}</Text>;
});

const Hairline = React.memo(function Hairline() {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        rowStyles.hairline,
        { backgroundColor: isDark ? '#1c1c1e' : (colors.border || 'rgba(0,0,0,0.08)') },
      ]}
    />
  );
});

export default function NotificationPreferencesComponent() {
  const { colors, isDark } = useTheme();
  const s = makeStyles(colors, isDark);
  const navigation = useNavigation<any>();
  const { tasks } = useCoreData();
  const { attendance, attendanceLogs, assignments, holidays } = useAcademicData();
  const { customEvents } = usePlannerData();

  const rescheduleWithFullContext = useCallback(() => {
    clearScheduleCache();
    InteractionManager.runAfterInteractions(() => {
      scheduleAllNotifications({
        tasks,
        customEvents,
        attendance,
        attendanceLogs,
        assignments,
        holidays,
      }).catch(console.warn);
    });
  }, [
    tasks, customEvents, attendance, attendanceLogs,
    assignments, holidays,
  ]);

  // Module toggles
  const [modTasks,      setModTasks]      = useState(true);
  const [modHabits,     setModHabits]     = useState(true);
  const [modAttendance, setModAttendance] = useState(true);
  const [modFocus,      setModFocus]      = useState(true);

  // Smart notification types
  const [habitStreakAtRisk,  setHabitStreakAtRisk]  = useState(true);
  const [overdueNudge,       setOverdueNudge]       = useState(true);
  const [assignmentAlert48h, setAssignmentAlert48h] = useState(true);
  const [assignmentAlert24h, setAssignmentAlert24h] = useState(true);
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
  const [strictTone, setStrictTone] = useState(false);
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
        setModAttendance( await loadBool('mod_attendance'));
        setModFocus(      await loadBool('mod_focus'));

        setHabitStreakAtRisk(  await loadBool('habit_streak_risk'));
        setOverdueNudge(       await loadBool('overdue_nudge'));
        setAssignmentAlert48h( await loadBool('assignment_48h'));
        setAssignmentAlert24h( await loadBool('assignment_24h'));
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

        const strictPref = (await AsyncStorage.getItem('zentrack_notif_sara_escalation'))
          ?? (await AsyncStorage.getItem('zentrack_notif_sara_tone'));
        setStrictTone(strictPref === 'true');
        setLocationNotifs(    await loadBool('location_notifs', false));
        setActionableNotifs(  await loadBool('actionable_notifs', true));
        setHabitStackNotifs(  await loadBool('habit_stack_notifs', true));
        setNotifSound(        await loadString('notifs_sound', 'default'));
      } catch {}
    })();
  }, []);

  const activeSoundRef = React.useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      if (activeSoundRef.current) {
        activeSoundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  // Toggle helper • saves + reschedules (deferred to avoid blocking toggle animation)
  const toggle = useCallback(async (key: string, val: boolean, setter: (v: boolean) => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setter(val);
    await saveBool(key, val);
    if (key === 'sara_tone' || key === 'sara_escalation') {
      await saveBool('sara_tone', val);
      await saveBool('sara_escalation', val);
    }
    rescheduleWithFullContext();
  }, [rescheduleWithFullContext]);

  // Time picker helpers
  const openPicker = (target: TimePickerTarget, current: string) => {
    setPickerTarget(target);
    setPickerDate(parseHM(current));
    setPickerVisible(true);
  };

  const commitPickedTime = async (selected: Date) => {
    const hm = toHM(selected);
    switch (pickerTarget) {
      case 'morningBriefTime': setMorningBriefTime(hm); await saveString('morning_brief_time', hm); break;
      case 'quietStart':       setQuietStart(hm);       await saveString('quiet_start', hm);        break;
      case 'quietEnd':         setQuietEnd(hm);         await saveString('quiet_end', hm);          break;
      case 'overdueNudgeTime': setOverdueNudgeTime(hm); await saveString('overdue_nudge_time', hm); break;
    }
    rescheduleWithFullContext();
  };

  const handlePickerChange = async (_: any, selected?: Date) => {
    if (Platform.OS === 'android') {
      setPickerVisible(false);
      if (selected) await commitPickedTime(selected);
    } else if (selected) {
      // On iOS spinner, only update local state while spinning; commit on "Done"
      setPickerDate(selected);
    }
  };

  const closePicker = () => setPickerVisible(false);
  const confirmIosPicker = async () => {
    setPickerVisible(false);
    await commitPickedTime(pickerDate);
  };

  const handleSelectSound = async (soundName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotifSound(soundName);
    await saveString('notifs_sound', soundName);
    await ensureNotificationChannels();
    rescheduleWithFullContext();

    try {
      if (activeSoundRef.current) {
        await activeSoundRef.current.unloadAsync().catch(() => {});
        activeSoundRef.current = null;
      }
      const soundMap: Record<string, any> = {
        'chime.wav': require('../../assets/sounds/chime.wav'),
        'alert.wav': require('../../assets/sounds/alert.wav'),
        'heavy.wav': require('../../assets/sounds/heavy.wav'),
      };
      if (soundMap[soundName]) {
        const { sound } = await Audio.Sound.createAsync(soundMap[soundName]);
        activeSoundRef.current = sound;
        sound.setOnPlaybackStatusUpdate(status => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            if (activeSoundRef.current === sound) activeSoundRef.current = null;
          }
        });
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
          <TimeRow icon="sunny-outline"     label="Morning briefing time" value={morningBriefTime} target="morningBriefTime" onOpenPicker={openPicker} />
          <Hairline />
          <TimeRow icon="alert-circle-outline" label="Overdue nudge time" value={overdueNudgeTime} target="overdueNudgeTime" onOpenPicker={openPicker} />
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
                  rescheduleWithFullContext();
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
              <TimeRow icon="moon-outline"  label="Quiet from" value={quietStart} target="quietStart" onOpenPicker={openPicker} />
              <Hairline />
              <TimeRow icon="sunny-outline" label="Quiet until" value={quietEnd}   target="quietEnd"   onOpenPicker={openPicker} />
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
                  rescheduleWithFullContext();
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
            icon="flash-outline"
            label="Strict Accountability Tone"
            subtitle="Tone escalation for missed habits & classes"
            value={strictTone}
            onToggle={v => toggle('sara_tone', v, setStrictTone)}
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
                      borderColor: isSelected ? colors.accentPrimary : (isDark ? '#2c2c2e' : (colors.border || 'rgba(0,0,0,0.1)'))
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
                  <TouchableOpacity onPress={confirmIosPicker}>
                    <Text style={{ color: colors.accentPrimary, fontSize: 15, fontWeight: '600' }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  display="spinner"
                  onChange={handlePickerChange}
                  style={{ height: 200 }}
                  textColor={isDark ? '#ffffff' : '#000000'}
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

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.background },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? '#1c1c1e' : (colors.border || 'rgba(0,0,0,0.08)'),
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
        borderColor: isDark ? '#2c2c2e' : (colors.border || 'rgba(0,0,0,0.08)'),
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
      hairline: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: isDark ? '#1c1c1e' : (colors.border || 'rgba(0,0,0,0.08)'),
        marginLeft: 58,
      },

      timeChip: {
        backgroundColor: isDark ? '#2c2c2e' : (colors.surface2 || '#e5e5ea'),
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
        backgroundColor: isDark ? '#2c2c2e' : (colors.surface2 || '#e5e5ea'),
      },
      chipActive: { backgroundColor: colors.accentPrimary },
      chipText: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: colors.textMuted },
      chipTextActive: { color: isDark ? '#000000' : '#ffffff', fontFamily: 'Inter_600SemiBold' },

      pickerModalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
      },
      pickerCard: {
        backgroundColor: isDark ? '#1c1c1e' : colors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 34,
      },
      pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? '#2c2c2e' : (colors.border || 'rgba(0,0,0,0.08)'),
      },
    });
