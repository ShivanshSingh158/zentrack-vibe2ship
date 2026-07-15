import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMobileData } from '../contexts/MobileDataContext';
import AnimatedPressable from '../components/AnimatedPressable';
import { BRUTAL_QUOTES } from '../data/brutalQuotes';


// XP Level thresholds
const XP_LEVELS = [
  { min: 0, label: 'Initiate' },
  { min: 500, label: 'Operator' },
  { min: 1500, label: 'Commander' },
  { min: 3500, label: 'Strategist' },
  { min: 7000, label: 'Vanguard' },
  { min: 13000, label: 'Architect' },
  { min: 22000, label: 'Legend' },
  { min: 35000, label: 'Mythic' },
];
function getLevel(xp: number) {
  let level = XP_LEVELS[0];
  let next = XP_LEVELS[1];
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i].min) {
      level = XP_LEVELS[i];
      next = XP_LEVELS[i + 1] || XP_LEVELS[i];
    }
  }
  const progress = next.min !== level.min
    ? (xp - level.min) / (next.min - level.min)
    : 1;
  return { label: level.label, progress: Math.min(progress, 1), xp, nextXP: next.min };
}

export default function DashboardScreen() {
  const { user, tasks, gymLogs, habitLogs, allHabits, attendance, assignments, pomodoroSessions } = useMobileData();
  const navigation = useNavigation<any>();

  const [quote, setQuote] = React.useState(BRUTAL_QUOTES[0]);
  const [xp, setXp] = React.useState(0);
  const [todayFocusMins, setTodayFocusMins] = React.useState(0);

  useFocusEffect(
    React.useCallback(() => {
      // Refresh quote on focus
      setQuote(BRUTAL_QUOTES[Math.floor(Math.random() * BRUTAL_QUOTES.length)]);
      // Load XP from storage
      AsyncStorage.getItem('zentrack_xp_v1').then(v => setXp(parseInt(v || '0', 10)));
    }, [])
  );

  // 1. Header Logic
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const hour = today.getHours();
  let timeGreeting = 'evening.';
  if (hour < 12) timeGreeting = 'morning.';
  else if (hour < 17) timeGreeting = 'afternoon.';
  
  const avatarLetter = user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'A';

  // 2. Stats Logic
  const todayStr = today.toISOString().slice(0, 10);
  const todayTasks = tasks.filter(t => t.date === todayStr);
  const doneTasksCount = todayTasks.filter(t => t.status === 'completed').length;

  // 3. Streak — includes tasks, gym, AND habits
  let currentStreak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    const dayTasks = tasks.filter(t => t.date === dStr);
    const dayGym = gymLogs ? gymLogs.find(g => g.date === dStr) : null;
    const dayHabits = habitLogs ? habitLogs.filter(l => l.date === dStr) : [];

    const tasksAssigned = dayTasks.length > 0;
    const allTasksDone = tasksAssigned && dayTasks.every(t => t.status === 'completed');
    const gymDone = !!dayGym;
    const habitDone = dayHabits.length > 0;

    // A day counts if: all tasks done OR gym logged OR at least one habit logged
    if ((tasksAssigned && allTasksDone) || gymDone || habitDone) {
      currentStreak++;
    } else if (tasksAssigned && !allTasksDone) {
      // Failed a scheduled day (had tasks, didn't finish all)
      if (i > 0) break;
    }
    // Rest day with no tasks, no gym, no habits — don't break or increment
  }

  // 4. Habit completion ring for today
  const activeHabits = allHabits.filter(h => !h.archived);
  const todayHabitLogs = habitLogs.filter(l => l.date === todayStr);
  const habitsCompleted = todayHabitLogs.length;
  const habitsTotal = activeHabits.length;

  // 5. XP level info
  const levelInfo = getLevel(xp);

  // 6. Upcoming assignments (due within 3 days)
  const in3days = new Date();
  in3days.setDate(in3days.getDate() + 3);
  const in3daysStr = in3days.toISOString().slice(0, 10);
  const urgentAssignments = (assignments || [])
    .filter(a => a.status !== 'submitted' && a.status !== 'graded' && a.dueDate && a.dueDate >= todayStr && a.dueDate <= in3daysStr)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    .slice(0, 2);

  // 8. Agenda
  const formatTimeStr = (tStr: string): string => {
    if (!tStr) return '';
    if (tStr.includes('-')) {
      return tStr.split('-').map(s => formatTimeStr(s.trim())).join(' - ');
    }
    const lower = tStr.toLowerCase();
    if (lower.includes('am') || lower.includes('pm')) return lower.replace(/\s+/g, '');
    const parts = tStr.split(':');
    if (parts.length < 2) return tStr;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return tStr;
    const ampm = h >= 12 ? 'pm' : 'am';
    const hr = h % 12 || 12;
    return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
  };

  const dayOfWeek = today.getDay().toString();
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayClasses = attendance?.flatMap(subj => {
    const sch = subj.schedule?.[dayOfWeek] || subj.schedule?.[Number(dayOfWeek)] || subj.schedule?.[DAY_NAMES[today.getDay()]] || subj.schedule?.[DAY_NAMES[today.getDay()].toLowerCase()];
    if (!sch) return [];
    const cls: any[] = [];
    if (sch.classes) sch.classes.forEach((c: any) => c.time && cls.push({ id: `${subj.id}-class-${c.time}`, title: `${subj.name} Class`, time: c.time, type: 'class' }));
    if (sch.labs) sch.labs.forEach((l: any) => l.time && cls.push({ id: `${subj.id}-lab-${l.time}`, title: `${subj.name} Lab`, time: l.time, type: 'lab' }));
    return cls;
  }) || [];
  todayClasses.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const todayGym = gymLogs ? gymLogs.find(g => g.date === todayStr) : null;
  const hasAgenda = todayGym || todayClasses.length > 0 || todayTasks.length > 0;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          {/* Header */}
          <View style={s.headerRow}>
            <View>
              <Text style={s.wordmark}>ZENTRACK</Text>
              <Text style={s.dateText}>{dateStr}</Text>
            </View>
            <AnimatedPressable style={s.avatarCircle} onPress={() => navigation.navigate('MoreStack', { screen: 'Settings' })}>
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={{ width: 28, height: 28, borderRadius: 14 }} />
              ) : (
                <Text style={s.avatarText}>{avatarLetter}</Text>
              )}
            </AnimatedPressable>
          </View>

          {/* Greeting */}
          <View style={s.greetingContainer}>
            <Text style={s.greetingGood}>Good</Text>
            <Text style={s.greetingTime}>{timeGreeting}</Text>
          </View>

          {/* Daily Quote */}
          <View style={{ marginTop: 24, marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={{ fontFamily: 'Inter_400Regular', fontStyle: 'italic', fontSize: 15, color: COLORS.textPrimary, lineHeight: 23 }}>
              "{quote.text}"
            </Text>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: COLORS.accentPrimary, marginTop: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
              — {quote.author}
            </Text>
          </View>

          {/* Capture Bar */}
          <View style={s.captureBar}>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('MoreStack', { screen: 'Tasks' });
              }}
            >
              <Ionicons name="add" size={18} color={COLORS.textTertiary} />
              <Text style={s.capturePlaceholder}>Capture a task, note, or workout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                navigation.navigate('SaraModal', { startVoice: true });
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="mic-outline" size={20} color={COLORS.accentPrimary} />
            </TouchableOpacity>
          </View>

          {/* Stats Row */}
          <View style={s.statsContainer}>
            <View style={s.statBox}>
              <Text style={s.statLabel}>STREAK</Text>
              <Text style={s.statValue}>{currentStreak}d</Text>
            </View>
            <View style={s.hairlineVertical} />
            <View style={s.statBox}>
              <Text style={s.statLabel}>HABITS</Text>
              <Text style={s.statValue}>{habitsCompleted}/{habitsTotal}</Text>
            </View>
            <View style={s.hairlineVertical} />
            <View style={s.statBox}>
              <Text style={s.statLabel}>DONE</Text>
              <Text style={s.statValue}>{doneTasksCount}/{todayTasks.length}</Text>
            </View>
          </View>



          {/* XP Level Bar */}
          <View style={s.xpContainer}>
            <View style={s.xpRow}>
              <Text style={s.xpLabel}>{levelInfo.label}</Text>
              <Text style={s.xpXpText}>{levelInfo.xp} XP</Text>
            </View>
            <View style={s.xpBarBg}>
              <View style={[s.xpBarFill, { width: `${levelInfo.progress * 100}%` as any }]} />
            </View>
          </View>

          {/* Urgent Assignments Banner */}
          {urgentAssignments.length > 0 && (
            <TouchableOpacity
              style={s.urgentBanner}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('MoreStack', { screen: 'Assignments' })}
            >
              <Ionicons name="warning-outline" size={14} color={COLORS.accentAmber} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.urgentTitle}>Due soon</Text>
                {urgentAssignments.map(a => (
                  <Text key={a.id} style={s.urgentItem} numberOfLines={1}>
                    · {a.title} — {a.dueDate === todayStr ? 'Today' : a.dueDate === in3daysStr ? 'in 3 days' : a.dueDate}
                  </Text>
                ))}
              </View>
              <Ionicons name="chevron-forward" size={14} color={COLORS.textTertiary} />
            </TouchableOpacity>
          )}

          {/* Agenda Section */}
          {hasAgenda && (
            <View style={{ marginTop: 32 }}>
              <Text style={s.sectionLabel}>TODAY'S AGENDA</Text>
              
              {todayGym && (
                <TouchableOpacity style={s.agendaRow} activeOpacity={0.7} onPress={() => navigation.navigate('MoreStack', { screen: 'Gym' })}>
                  <Ionicons name="barbell-outline" size={16} color={COLORS.accentPrimary} style={{ marginRight: 12 }} />
                  <Text style={s.agendaRowText}>Gym Workout Scheduled</Text>
                </TouchableOpacity>
              )}

              {todayClasses.map(c => (
                <TouchableOpacity key={c.id} style={s.agendaRow} activeOpacity={0.7} onPress={() => navigation.navigate('MoreStack', { screen: 'Attendance' })}>
                  <Ionicons name={c.type === 'lab' ? "flask-outline" : "library-outline"} size={16} color={COLORS.accentAmber} style={{ marginRight: 12 }} />
                  <Text style={[s.agendaRowText, { flex: 1 }]}>{c.title}</Text>
                  <Text style={s.agendaRowTime}>{formatTimeStr(c.time)}</Text>
                </TouchableOpacity>
              ))}

              {todayTasks.map(t => (
                <TouchableOpacity key={t.id} style={s.agendaRow} activeOpacity={0.7} onPress={() => navigation.navigate('MoreStack', { screen: 'Tasks' })}>
                  <Ionicons
                    name={t.status === 'completed' ? "checkmark-circle" : "ellipse-outline"}
                    size={16}
                    color={t.status === 'completed' ? COLORS.accentGreen : COLORS.textTertiary}
                    style={{ marginRight: 12 }}
                  />
                  <Text style={[s.agendaRowText, t.status === 'completed' && { color: COLORS.textTertiary, textDecorationLine: 'line-through' }, { flex: 1 }]} numberOfLines={1}>
                    {t.title}
                  </Text>
                  {t.timeSlot && <Text style={s.agendaRowTime}>{formatTimeStr(t.timeSlot)}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

        </ScrollView>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 8, paddingTop: 20, paddingBottom: 100 },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  wordmark: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 0.5, color: COLORS.textTertiary, marginBottom: 2 },
  dateText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: COLORS.textTertiary },
  
  avatarCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.accentPrimary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '700', color: '#000000' },
  
  greetingContainer: { marginTop: 24 },
  greetingGood: { fontFamily: 'Inter_700Bold', fontSize: 34, color: COLORS.textPrimary, lineHeight: 40 },
  greetingTime: { fontFamily: 'PlayfairDisplay_600SemiBold_Italic', fontSize: 34, color: COLORS.accentPrimary, lineHeight: 40 },

  captureBar: {
    marginTop: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  capturePlaceholder: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13.5,
    color: COLORS.textTertiary,
    marginHorizontal: 12,
  },

  statsContainer: {
    flexDirection: 'row',
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  statBox: { alignItems: 'center' },
  statLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#f2f2f7',
  },
  hairlineVertical: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },



  // XP Bar
  xpContainer: { marginTop: 20, paddingHorizontal: 4 },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  xpLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: COLORS.accentPrimary, letterSpacing: 0.5 },
  xpXpText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: COLORS.textTertiary },
  xpBarBg: { height: 3, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  xpBarFill: { height: '100%', backgroundColor: COLORS.accentPrimary, borderRadius: 2 },

  // Urgent Assignment Banner
  urgentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(255,159,77,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,77,0.25)',
    borderRadius: 12,
    padding: 14,
  },
  urgentTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: COLORS.accentAmber, letterSpacing: 0.5, marginBottom: 4 },
  urgentItem: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },

  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.textTertiary,
    marginBottom: 16,
    textTransform: 'uppercase',
  },

  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  agendaRowText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  agendaRowTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textTertiary,
  },

  secondaryNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: '#0a0a0a',
  },
  navBtn: { alignItems: 'center', gap: 6 },
  navLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9.5,
    color: COLORS.textTertiary,
  },
});
