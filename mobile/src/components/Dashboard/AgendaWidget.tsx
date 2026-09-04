import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import VoiceDictationOverlay from '../Tasks/VoiceDictationOverlay';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { WEEKDAY_TO_PLAN, GYM_PLAN } from '../../data/gymPlan';
import { getCustomPlanDay } from '../../hooks/useGymLog';

interface AgendaWidgetProps {
  tasks: any[];
  gymLogs: any[];
  userGymPlan: any;
  attendance: any[];
  attendanceLogs: any[];
  todayStr: string;
  nowDate: Date;
  holidays?: string[];
}

export const AgendaWidget = React.memo(function AgendaWidget({
  tasks,
  gymLogs,
  userGymPlan,
  attendance,
  attendanceLogs,
  todayStr,
  nowDate,
  holidays = []
}: AgendaWidgetProps) {
  const { colors, isDark } = useTheme();
  const { user } = useCoreData();
  const navigation = useNavigation<any>();
  const [isVoiceDictationOpen, setIsVoiceDictationOpen] = useState(false);

  const { todayTasks, todayClasses, todayGym, shouldShowGymInAgenda, plannedDay, formatTimeStr } = useMemo(() => {
    const isHoliday = holidays?.includes(todayStr) || false;
    const todayTasks = tasks.filter(t => t.date === todayStr);
    
    const dayOfWeek  = nowDate.getDay().toString();
    const DAY_NAMES  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    // On holidays, omit all academic classes from the agenda (including cancelled logs)
    const todayClasses = isHoliday ? [] : (attendance?.flatMap(subj => {
      const sch = subj.schedule?.[dayOfWeek] || subj.schedule?.[Number(dayOfWeek)]
        || subj.schedule?.[DAY_NAMES[nowDate.getDay()]]
        || subj.schedule?.[DAY_NAMES[nowDate.getDay()].toLowerCase()];
      if (!sch) return [];
      const cls: any[] = [];
      if (sch.classes) sch.classes.forEach((c: any) => c.time && cls.push({ id: `${subj.id}-class-${c.time}`, title: `${subj.name} Class`, time: c.time, type: 'class', subjectId: subj.id }));
      if (sch.labs)    sch.labs.forEach((l: any)    => l.time && cls.push({ id: `${subj.id}-lab-${l.time}`,   title: `${subj.name} Lab`,   time: l.time, type: 'lab', subjectId: subj.id }));
      return cls;
    }) || []);

    // O(1) Map Pre-Indexing for attendance logs
    const todayLogsMap = new Map<string, any>();
    (attendanceLogs || []).forEach(l => {
      if (l.date === todayStr) {
        todayLogsMap.set(`${l.subjectId}_${l.type || 'class'}`, l);
      }
    });

    todayClasses.forEach(c => {
      const log = todayLogsMap.get(`${c.subjectId}_${c.type || 'class'}`);
      if (log) {
        if (log.action === 'attended') c.isCompleted = true;
        if (log.action === 'absent' || log.action === 'missed') c.isMissed = true;
        if (log.action === 'cancelled') c.isCancelled = true;
      }
    });

    const todayGym = gymLogs?.find(g => g.date === todayStr);
    const planDayIndex = WEEKDAY_TO_PLAN[nowDate.getDay()];
    
    const hasUserPlan = userGymPlan?.customDays && Object.keys(userGymPlan.customDays).length > 0;
    const plannedDay = hasUserPlan 
      ? getCustomPlanDay(userGymPlan.customDays, planDayIndex) 
      : null;

    // Strict Rest check: if planned day is rest or has no exercises
    const isRestPlan = !plannedDay || plannedDay.isRest === true || plannedDay.name?.toLowerCase().includes('rest') || (Array.isArray(plannedDay.exercises) && plannedDay.exercises.length === 0);

    // Has the user actually logged or started a real non-rest workout today?
    const hasLoggedSets = Array.isArray(todayGym?.exercises) && todayGym.exercises.some((e: any) => Array.isArray(e.setsLog) && e.setsLog.some((s: any) => s.completed || (typeof s.reps === 'number' && s.reps > 0)));
    const hasCompletedDuration = !!(todayGym?.workoutDurationMinutes && todayGym.workoutDurationMinutes > 0 && !todayGym?.isRestDay);
    const hasActiveWorkoutInProgress = !!(todayGym?.workoutStartTime && !hasCompletedDuration && !todayGym?.isRestDay && !isRestPlan);
    const hasRealWorkoutLog = hasLoggedSets || hasCompletedDuration || hasActiveWorkoutInProgress;
    const isGymScheduled = !isRestPlan && !!(plannedDay && !plannedDay.isRest);
    // Show gym in agenda ONLY IF: (1) user has a real active workout log today OR (2) today is a planned non-rest workout day
    const shouldShowGymInAgenda = hasRealWorkoutLog || isGymScheduled;

    const formatTimeStr = (tStr: string): string => {
      if (!tStr) return '';
      if (tStr.includes('-')) return tStr.split('-').map(s => formatTimeStr(s.trim())).join(' - ');
      const lower = tStr.toLowerCase();
      if (lower.includes('am') || lower.includes('pm')) return lower.replace(/\s+/g, '');
      const parts = tStr.split(':');
      if (parts.length < 2) return tStr;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return tStr;
      const ampm = h >= 12 ? 'pm' : 'am';
      const hr   = h % 12 || 12;
      return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
    };

    return { todayTasks, todayClasses, todayGym, shouldShowGymInAgenda, plannedDay, formatTimeStr };
  }, [tasks, gymLogs, userGymPlan, attendance, attendanceLogs, todayStr, nowDate, holidays]);

  const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes();

  // ── Memoized Agenda Items Generation & Sorting ───────────────────────────
  const agendaItems = useMemo(() => {
    const parseTimeToMins = (tStr: string): number => {
      if (!tStr) return 9999;
      const startStr = tStr.split('-')[0].trim().toLowerCase();
      let h = 0; let m = 0;
      const isPM = startStr.includes('pm');
      const isAM = startStr.includes('am');
      const cleanStr = startStr.replace(/[a-z\s]/g, '');
      const parts = cleanStr.split(':');
      if (parts.length >= 2) {
        h = parseInt(parts[0], 10) || 0; m = parseInt(parts[1], 10) || 0;
      } else {
        h = parseInt(parts[0], 10) || 0;
      }
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return h * 60 + m;
    };

    const getEndTimeMins = (tStr: string): number => {
      if (!tStr) return 9999;
      const parts = tStr.split('-');
      const endStr = (parts.length > 1 ? parts[1] : parts[0]).trim().toLowerCase();
      let h = 0; let m = 0;
      const isPM = endStr.includes('pm');
      const isAM = endStr.includes('am');
      const cleanStr = endStr.replace(/[a-z\s]/g, '');
      const timeParts = cleanStr.split(':');
      if (timeParts.length >= 2) {
        h = parseInt(timeParts[0], 10) || 0; m = parseInt(timeParts[1], 10) || 0;
      } else {
        h = parseInt(timeParts[0], 10) || 0;
      }
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return h * 60 + m;
    };

    const items: any[] = [];

    if (shouldShowGymInAgenda) {
      const isGymCompleted = !!todayGym?.workoutDurationMinutes;

      let gymTimeStr = '';
      let gymTimeMins = 1080; // default 6:00 PM

      if (plannedDay?.startTime) {
        if (plannedDay.endTime) {
           gymTimeStr = formatTimeStr(`${plannedDay.startTime}-${plannedDay.endTime}`);
        } else {
           gymTimeStr = formatTimeStr(plannedDay.startTime);
        }
        gymTimeMins = parseTimeToMins(plannedDay.startTime);
      }

      const gymTitle = todayGym?.workoutStartTime && !isGymCompleted
        ? 'Gym Workout (In Progress)'
        : isGymCompleted
          ? 'Gym Workout (Completed)'
          : `Gym: ${plannedDay?.name || 'Workout'}`;

      if (!gymTitle.toLowerCase().includes('rest')) {
        items.push({
          id: 'gym-item',
          title: gymTitle,
          timeStr: gymTimeStr,
          timeMins: isGymCompleted ? -1 : gymTimeMins,
          isCompleted: isGymCompleted,
          isMissed: false,
          isCancelled: false,
          icon: isGymCompleted ? 'checkmark-circle' : 'barbell-outline',
          iconColor: isGymCompleted ? colors.accentGreen : colors.textPrimary,
          onPress: () => navigation.navigate('Gym')
        });
      }
    }

    todayClasses.forEach((c: any) => {
      let isMissed = c.isMissed;
      if (!c.isCompleted && !c.isCancelled && !isMissed) {
        const endTimeMins = getEndTimeMins(c.time);
        if (nowMins > endTimeMins) {
          isMissed = true;
        }
      }

      let icon = c.type === 'lab' ? 'flask-outline' : 'library-outline';
      if (c.isCompleted) icon = 'checkmark-circle';
      if (isMissed) icon = 'close-circle';
      if (c.isCancelled) icon = 'remove-circle';

      let iconColor = colors.accentAmber;
      if (c.isCompleted) iconColor = colors.accentGreen;
      if (isMissed) iconColor = colors.error;
      if (c.isCancelled) iconColor = colors.textTertiary;

      items.push({
        id: c.id,
        title: c.title,
        timeStr: formatTimeStr(c.time),
        timeMins: parseTimeToMins(c.time),
        isCompleted: c.isCompleted,
        isMissed,
        isCancelled: c.isCancelled,
        icon,
        iconColor,
        onPress: () => navigation.navigate('Attendance')
      });
    });

    todayTasks.forEach((t: any) => {
      let isMissed = t.status === 'missed' || t.status === 'failed';
      const isCancelled = t.status === 'cancelled';
      const isCompleted = t.status === 'completed' || t.status === 'done';

      if (!isCompleted && !isCancelled && !isMissed && t.timeSlot) {
        const endTimeMins = getEndTimeMins(t.timeSlot);
        if (nowMins > endTimeMins) {
          isMissed = true;
        }
      }

      let icon = 'ellipse-outline';
      if (isCompleted) icon = 'checkmark-circle';
      if (isMissed) icon = 'close-circle';
      if (isCancelled) icon = 'remove-circle';

      let iconColor = colors.textTertiary;
      if (isCompleted) iconColor = colors.accentGreen;
      if (isMissed) iconColor = colors.error;
      if (isCancelled) iconColor = colors.textTertiary;

      items.push({
        id: t.id,
        title: t.title,
        timeStr: t.timeSlot ? formatTimeStr(t.timeSlot) : '',
        timeMins: t.timeSlot ? parseTimeToMins(t.timeSlot) : 9999,
        isCompleted,
        isMissed,
        isCancelled,
        icon,
        iconColor,
        onPress: () => navigation.navigate('Tasks')
      });
    });

    items.sort((a, b) => {
      const aIsInactive = a.isCompleted || a.isMissed || a.isCancelled;
      const bIsInactive = b.isCompleted || b.isMissed || b.isCancelled;

      if (aIsInactive && !bIsInactive) return 1;
      if (!aIsInactive && bIsInactive) return -1;
      
      return a.timeMins - b.timeMins;
    });

    return items;
  }, [shouldShowGymInAgenda, todayGym, plannedDay, todayClasses, todayTasks, nowMins, colors, formatTimeStr, navigation]);

  if (agendaItems.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Image
          source={require('../../../assets/images/sara-running.png')}
          style={styles.emptyMascot}
          resizeMode="contain"
        />
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
          Rest & Recharge
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
          No tasks or sessions scheduled for today. Recovery is where growth happens—take a breather or start an activity!
        </Text>

        <View style={styles.emptyActionsRow}>
          <TouchableOpacity
            style={[styles.emptyActionBtn, { backgroundColor: colors.accentPrimary }]}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate('Tasks');
            }}
          >
            <Ionicons name="add" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
            <Text style={[styles.emptyActionTextPrimary, { color: isDark ? '#000000' : '#FFFFFF' }]}>Add Task</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.emptyActionBtn, styles.emptyVoiceBtn]}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setIsVoiceDictationOpen(true);
            }}
          >
            <Ionicons name="mic" size={16} color="#FFFFFF" />
            <Text style={styles.emptyVoiceText}>Voice</Text>
          </TouchableOpacity>
        </View>

        {isVoiceDictationOpen && (
          <VoiceDictationOverlay
            visible={isVoiceDictationOpen}
            onClose={() => setIsVoiceDictationOpen(false)}
            selectedDate={todayStr}
            userId={user?.uid}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>TODAY'S AGENDA</Text>
      {agendaItems.map(item => {
        let textColor = colors.textPrimary;
        let timeColor = colors.textTertiary;
        
        if (item.isMissed || item.isCompleted || item.isCancelled) {
          textColor = colors.textTertiary;
          timeColor = colors.textTertiary;
        }

        return (
          <TouchableOpacity key={item.id} style={[styles.agendaRow, { borderBottomColor: colors.border }]} activeOpacity={0.7} onPress={item.onPress}>
            <Ionicons
              name={item.icon}
              size={18}
              color={item.iconColor}
              style={{ marginRight: 10 }}
            />
            <Text style={[
              styles.agendaRowText,
              { color: textColor },
              (item.isCompleted || item.isMissed || item.isCancelled) && { textDecorationLine: 'line-through' },
              { flex: 1 },
            ]} numberOfLines={1}>
              {item.title}
            </Text>
            {!!item.timeStr && (
              <Text style={[
                styles.agendaRowTime, 
                { color: timeColor },
                (item.isCompleted || item.isMissed || item.isCancelled) && { textDecorationLine: 'line-through' }
              ]}>
                {item.timeStr}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}

      {isVoiceDictationOpen && (
        <VoiceDictationOverlay
          visible={isVoiceDictationOpen}
          onClose={() => setIsVoiceDictationOpen(false)}
          selectedDate={todayStr}
          userId={user?.uid}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 4,
    marginLeft: 4,
  },
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  agendaRowText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 14,
  },
  agendaRowTime: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 12,
  },
  emptyContainer: {
    marginTop: 18,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  emptyMascot: {
    width: 110,
    height: 110,
    marginBottom: 8,
    opacity: 0.95,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 22,
  },
  emptyActionTextPrimary: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: '#000000',
  },
  emptyVoiceBtn: {
    backgroundColor: '#FF453A',
    shadowColor: '#FF453A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  emptyVoiceText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
});

