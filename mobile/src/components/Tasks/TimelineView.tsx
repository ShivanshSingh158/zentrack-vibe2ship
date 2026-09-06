import React, { useCallback, useMemo, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';

import { Task, AttendanceSubject, AttendanceLog, GymLog } from '../../contexts/MobileDataContext';
import { UserGymPlanDoc, GymPlanDay } from '../../types/gym.types';
import { getCustomPlanDay, planDayIndexForDate } from '../../hooks/useGymLog';
import { GYM_PLAN } from '../../data/gymPlan';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { db } from '../../services/firebase';
import { feedback } from '../../utils/haptics';
import { formatLocalDateStr } from '../../utils/dateUtils';
import { useTheme } from '../../contexts/ThemeContext';

// Extracted math, subcomponents & styles
import {
  ClassBlock, DEFAULT_START_HOUR, END_HOUR, HOUR_HEIGHT, SNAP_MINUTES,
  SNAP_PX, DAY_NAMES, HatchOverlay, parseTime, floatToTimeString,
  parseTimeRange, snapTopToGrid, topToTimeSlot, getTaskBlockColors,
  getStaticBlockColors,
} from './timelineMath';
import DraggableTaskBlock from './DraggableTaskBlock';
import { styles } from './timelineViewStyles';

export type { ClassBlock };

interface TimelineViewProps {
  tasks: Task[];
  onTaskPress: (task: Task) => void;
  colors?: any;
  isDark?: boolean;
  // Data props passed from the screen coordinator — prevents TimelineView from
  // subscribing directly to AcademicContext and WellnessContext (which would
  // cause full re-renders on every water log, assignment, or weight update).
  attendance: AttendanceSubject[];
  attendanceLogs: AttendanceLog[];
  gymLogs: GymLog[];
  userGymPlan: UserGymPlanDoc | null | undefined;
  selectedDate?: string;
}

// •• Main TimelineView ••••••••••••••••••••••••••••••••••••••••••••••••••••••••

const TimelineView = React.memo(function TimelineView({
  tasks,
  onTaskPress,
  colors: propColors,
  isDark: propIsDark,
  attendance,
  attendanceLogs,
  gymLogs,
  userGymPlan,
  selectedDate,
}: TimelineViewProps) {
  const theme = useTheme();
  const colors = propColors || theme.colors;
  const isDark = propIsDark !== undefined ? propIsDark : theme.isDark;
  const navigation = useNavigation<any>();

  // Live time tracking for "Current Time" indicator
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = formatLocalDateStr(currentTime);
  const isToday = selectedDate === todayStr;
  const isPastDay = selectedDate ? selectedDate < todayStr : false;
  const nowHours = currentTime.getHours() + currentTime.getMinutes() / 60;

  // •• Dynamically compute START_HOUR from earliest task/class/gym (min 5 AM) ••••
  const START_HOUR = useMemo(() => {
    const floats: number[] = [];

    tasks
      .filter(t => t.timeSlot)
      .forEach(t => {
        const parts = t.timeSlot!.split(/[-–—•]| to /i);
        const f = parseTime(parts[0]);
        if (f !== null && f <= END_HOUR) floats.push(f);
      });

    if (attendance && selectedDate) {
      const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
      const dayKey = dayOfWeek.toString();
      
      attendance.forEach(subj => {
        const sch = subj.schedule?.[dayKey] || subj.schedule?.[dayOfWeek as any] || subj.schedule?.[DAY_NAMES[dayOfWeek]] || subj.schedule?.[DAY_NAMES[dayOfWeek].toLowerCase()];
        if (!sch) return;
        (sch.classes || []).forEach((c: any) => {
          const f = parseTime(c.time?.split(/[-–—•]| to /i)[0]);
          if (f !== null && f <= END_HOUR) floats.push(f);
        });
        (sch.labs || []).forEach((l: any) => {
          const f = parseTime(l.time?.split(/[-–—•]| to /i)[0]);
          if (f !== null && f <= END_HOUR) floats.push(f);
        });
      });
    }

    if (selectedDate) {
      const gLog = (gymLogs || []).find(g => g.date === selectedDate);
      const planIdx = planDayIndexForDate(selectedDate);
      const gPlan = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find(d => d.dayIndex === planIdx);
      const isRest = gPlan?.isRest ?? (planIdx === 7);
      if (gLog?.startTime || !isRest) {
        const f = parseTime(gLog?.startTime || gPlan?.startTime || '18:00');
        if (f !== null && f <= END_HOUR) floats.push(f);
      }
    }

    if (floats.length === 0) return DEFAULT_START_HOUR;
    const minFloat = Math.min(...floats);
    return Math.min(DEFAULT_START_HOUR, Math.max(0, Math.floor(minFloat - 0.1)));
  }, [tasks, attendance, gymLogs, userGymPlan, selectedDate]);

  const hours = useMemo(() => {
    const arr = [];
    for (let i = START_HOUR; i <= END_HOUR; i++) {
      const ampm = i >= 12 ? 'PM' : 'AM';
      const displayHour = i % 12 || 12;
      arr.push({ hour: i, label: `${displayHour}:00 ${ampm}` });
    }
    return arr;
  }, [START_HOUR]);

  // •• Build positioned task blocks ••••••••••••••••••••••••••••••••••••••••••
  const positionedTasks = useMemo(() => {
    const raw = (tasks || [])
      .filter(t => t.timeSlot)
      .map(task => {
        const parts = task.timeSlot!.split(/[-–—•]| to /i);
        const startText = parts[0];
        const endText = parts[1];

        const startFloat = parseTime(startText);
        const endFloat = endText ? parseTime(endText) : (startFloat ? startFloat + 1 : null);

        if (startFloat === null || startFloat > END_HOUR) return null;

        const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
        const durationFloat = endFloat && endFloat > startFloat
          ? endFloat - startFloat
          : 0.75;
        const height = durationFloat * HOUR_HEIGHT;

        const isMissed = task.status === 'pending' && ((isToday && endFloat !== null && endFloat < nowHours) || isPastDay);

        return {
          task,
          top,
          height: Math.max(height, HOUR_HEIGHT * 0.5),
          startFloat,
          endFloat: endFloat || (startFloat + 0.75),
          durationFloat,
          isMissed,
          leftPercent: 0,
          widthPercent: 100,
        };
      })
      .filter(Boolean) as {
        task: Task;
        top: number;
        height: number;
        startFloat: number;
        endFloat: number;
        durationFloat: number;
        isMissed: boolean;
        leftPercent: number;
        widthPercent: number;
      }[];

    // Partition overlapping blocks into side-by-side columns
    const sorted = [...raw].sort((a, b) => a.startFloat - b.startFloat);
    const groups: (typeof raw[0])[][] = [];
    let currentGroup: (typeof raw[0])[] = [];
    let lastGroupEnd = 0;

    sorted.forEach((block) => {
      if (currentGroup.length === 0) {
        currentGroup.push(block);
        lastGroupEnd = block.endFloat;
      } else if (block.startFloat < lastGroupEnd) {
        currentGroup.push(block);
        lastGroupEnd = Math.max(lastGroupEnd, block.endFloat);
      } else {
        groups.push(currentGroup);
        currentGroup = [block];
        lastGroupEnd = block.endFloat;
      }
    });
    if (currentGroup.length > 0) groups.push(currentGroup);

    groups.forEach((group) => {
      const count = group.length;
      group.forEach((block, idx) => {
        if (count > 1) {
          block.leftPercent = (idx / count) * 100;
          block.widthPercent = 100 / count;
        } else {
          block.leftPercent = 0;
          block.widthPercent = 100;
        }
      });
    });

    return sorted;
  }, [tasks, START_HOUR, isToday, isPastDay, nowHours]);

  // •• Build positioned class/lab blocks from attendance schedule •••••••••••
  const classBlocks = useMemo((): ClassBlock[] => {
    if (!attendance || !selectedDate) return [];
    const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
    const dayKey = dayOfWeek.toString();
    const blocks: ClassBlock[] = [];

    // O(N) pre-index: one pass over attendanceLogs for today's date only.
    // Replaces the O(N²) .filter() called inside each subject × class/lab loop.
    // Key format: "${subjectId}_class" or "${subjectId}_lab"
    const logsByKey = new Map<string, any[]>();
    for (const l of (attendanceLogs || [])) {
      if (l.date !== selectedDate || l.isExtra) continue;
      const key = `${l.subjectId}_${l.type || 'class'}`;
      const arr = logsByKey.get(key);
      if (arr) { arr.push(l); } else { logsByKey.set(key, [l]); }
    }

    attendance.forEach(subject => {
      const sch =
        subject.schedule?.[dayKey] ||
        subject.schedule?.[dayOfWeek as any] ||
        subject.schedule?.[DAY_NAMES[dayOfWeek]] ||
        subject.schedule?.[DAY_NAMES[dayOfWeek].toLowerCase()];

      if (!sch) return;

      if (sch.classes && Array.isArray(sch.classes)) {
        sch.classes.forEach((c: any, i: number) => {
          if (!c.time) return;
          const { startFloat, endFloat: parsedEnd } = parseTimeRange(c.time, 1);
          if (startFloat === null || startFloat > END_HOUR) return;
          const endFloat = Math.min(END_HOUR, parsedEnd ?? (startFloat + 1));
          const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
          const height = (endFloat - startFloat) * HOUR_HEIGHT;

          // O(1) Map lookup instead of O(N) filter
          const subLogs = logsByKey.get(`${subject.id}_class`) || [];
          const matchLog = subLogs[i] || (subLogs.length === 1 ? subLogs[0] : null);
          const logStatus: 'attended' | 'missed' | 'cancelled' | 'unlogged' = matchLog ? (matchLog.action as any) : 'unlogged';
          const isOngoing = isToday && nowHours >= startFloat && nowHours < endFloat;

          blocks.push({
            id: `${subject.id}-class-${i}`,
            title: subject.name,
            type: 'class',
            startFloat,
            endFloat,
            top,
            height: Math.max(height - 4, 38),
            time: `${floatToTimeString(startFloat)} - ${floatToTimeString(endFloat)}`,
            room: c.room,
            logStatus,
            isOngoing,
          });
        });
      }

      if (sch.labs && Array.isArray(sch.labs)) {
        sch.labs.forEach((l: any, i: number) => {
          if (!l.time) return;
          const { startFloat, endFloat: parsedEnd } = parseTimeRange(l.time, 2);
          if (startFloat === null || startFloat > END_HOUR) return;
          const endFloat = Math.min(END_HOUR, parsedEnd ?? (startFloat + 2));
          const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
          const height = (endFloat - startFloat) * HOUR_HEIGHT;

          // O(1) Map lookup instead of O(N) filter
          const subLogs = logsByKey.get(`${subject.id}_lab`) || [];
          const matchLog = subLogs[i] || (subLogs.length === 1 ? subLogs[0] : null);
          const logStatus: 'attended' | 'missed' | 'cancelled' | 'unlogged' = matchLog ? (matchLog.action as any) : 'unlogged';
          const isOngoing = isToday && nowHours >= startFloat && nowHours < endFloat;

          blocks.push({
            id: `${subject.id}-lab-${i}`,
            title: `${subject.name} (Lab)`,
            type: 'lab',
            startFloat,
            endFloat,
            top,
            height: Math.max(height - 4, 38),
            time: `${floatToTimeString(startFloat)} - ${floatToTimeString(endFloat)}`,
            room: l.room,
            logStatus,
            isOngoing,
          });
        });
      }
    });

    return blocks.sort((a, b) => a.startFloat - b.startFloat);
  }, [attendance, attendanceLogs, selectedDate, START_HOUR, isToday, nowHours]);

  // •• Build gym block from gymLogs and userGymPlan •••••••••••••••••••••••••••
  const gymBlock = useMemo((): ClassBlock | null => {
    if (!selectedDate) return null;
    const gLog = (gymLogs || []).find(g => g.date === selectedDate);
    const planIdx = planDayIndexForDate(selectedDate);
    const gPlan = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find(d => d.dayIndex === planIdx);
    
    // Check if this day is a gym day or has a manual log
    const isRest = gPlan?.isRest ?? (planIdx === 7);
    if (!gLog?.startTime && isRest) return null;

    // Use manual override first, then weekly schedule, then default '18:00'
    const startTimeStr = gLog?.startTime || gPlan?.startTime || '18:00';
    const endTimeStr = gLog?.endTime || gPlan?.endTime || (startTimeStr === '18:00' ? '19:30' : undefined);

    const { startFloat, endFloat: parsedEnd } = parseTimeRange(`${startTimeStr} - ${endTimeStr || ''}`, 1.5);
    if (startFloat === null || startFloat > END_HOUR) return null;
    
    const endFloat = Math.min(END_HOUR, parsedEnd ?? (startFloat + 1.5));
    const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
    const height = (endFloat - startFloat) * HOUR_HEIGHT;

    const hasCompletedSets = (gLog?.exercises || []).some(
      (ex: any) => (ex.setsLog || []).some((s: any) => s.completed)
    );
    const isGymDone = !!gLog?.completed || hasCompletedSets || (gLog?.workoutDurationMinutes !== undefined && gLog.workoutDurationMinutes > 0);
    const isOngoing = isToday && nowHours >= startFloat && nowHours < endFloat && !isGymDone;
    const logStatus: 'attended' | 'missed' | 'cancelled' | 'unlogged' = isGymDone ? 'attended' : 'unlogged';
    
    const workoutTitle = gPlan?.name || (gPlan?.focus ? `Workout: ${gPlan.focus}` : 'Gym Workout');

    return {
      id: `gym-${selectedDate}`,
      title: workoutTitle,
      type: 'gym',
      startFloat,
      endFloat,
      top,
      height: Math.max(height - 4, 38),
      time: `${floatToTimeString(startFloat)} - ${floatToTimeString(endFloat)}`,
      room: 'Gym',
      logStatus,
      isOngoing,
    };
  }, [gymLogs, userGymPlan, selectedDate, START_HOUR, isToday, nowHours]);

  // •• Calculate Free Time gaps between all events •••••••••••••••••••••••••••
  const freeTimeBlocks = useMemo(() => {
    const allBlocks: { startFloat: number; endFloat: number }[] = [];

    positionedTasks.forEach(pt => {
      if (pt) allBlocks.push({ startFloat: pt.startFloat, endFloat: pt.endFloat });
    });
    classBlocks.forEach(cb => {
      allBlocks.push({ startFloat: cb.startFloat, endFloat: cb.endFloat });
    });
    if (gymBlock) {
      allBlocks.push({ startFloat: gymBlock.startFloat, endFloat: gymBlock.endFloat });
    }

    allBlocks.sort((a, b) => a.startFloat - b.startFloat);

    const fBlocks: { top: number; height: number }[] = [];
    let currentTimeFloat = START_HOUR;

    for (const block of allBlocks) {
      if (block.startFloat - currentTimeFloat >= 1) {
        fBlocks.push({
          top: (currentTimeFloat - START_HOUR) * HOUR_HEIGHT,
          height: (block.startFloat - currentTimeFloat) * HOUR_HEIGHT,
        });
      }
      currentTimeFloat = Math.max(currentTimeFloat, block.endFloat);
    }
    if (currentTimeFloat < END_HOUR) {
      fBlocks.push({
        top: (currentTimeFloat - START_HOUR) * HOUR_HEIGHT,
        height: (END_HOUR - currentTimeFloat) * HOUR_HEIGHT,
      });
    }
    return fBlocks;
  }, [positionedTasks, classBlocks, gymBlock, START_HOUR]);

  // •• Collision check •••••••••••••••••••••••••••••••••••••••••••••••••••••••
  const checkCollision = useCallback((
    draggedTaskId: string,
    proposedTop: number,
    blockHeight: number
  ): boolean => {
    const proposedStart = START_HOUR + proposedTop / HOUR_HEIGHT;
    const proposedEnd = proposedStart + blockHeight / HOUR_HEIGHT;

    for (const pt of positionedTasks) {
      if (pt.task.id === draggedTaskId) continue;
      if (proposedStart < pt.endFloat && proposedEnd > pt.startFloat) return true;
    }
    for (const cb of classBlocks) {
      if (proposedStart < cb.endFloat && proposedEnd > cb.startFloat) return true;
    }
    if (gymBlock) {
      if (proposedStart < gymBlock.endFloat && proposedEnd > gymBlock.startFloat) return true;
    }
    return false;
  }, [positionedTasks, classBlocks, gymBlock, START_HOUR]);

  // •• Save new timeSlot to Firestore ••••••••••••••••••••••••••••••••••••••••
  const handleReschedule = useCallback(async (taskId: string, newTimeSlot: string) => {
    try {
      feedback.commit();
      await updateDoc(doc(db, 'tasks', taskId), { timeSlot: newTimeSlot });
    } catch (e) {
      feedback.warning();
      console.warn('[TimelineView] reschedule failed:', e);
    }
  }, []);

  const handleStaticBlockPress = (cb: ClassBlock) => {
    feedback.tap();
    if (cb.type === 'gym') {
      navigation.navigate('MoreStack', { screen: 'Gym' });
    } else {
      navigation.navigate('MoreStack', { screen: 'Attendance' });
    }
  };

  const indicatorTop = (nowHours - START_HOUR) * HOUR_HEIGHT;
  const showCurrentTimeIndicator = isToday && nowHours >= START_HOUR && nowHours <= END_HOUR;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Background Grid */}
      {hours.map((h) => (
        <View key={h.hour} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
          <Text style={[styles.timeLabel, { color: isDark ? colors.textMuted : colors.textTertiary }]}>{h.label}</Text>
          <View style={[styles.hourLine, { backgroundColor: isDark ? colors.border : '#E2E1EA' }]} />
        </View>
      ))}

      {/* Absolute Positioned Events */}
      <View style={styles.tasksContainer}>
        {/* Live Current Time Indicator */}
        {showCurrentTimeIndicator && (
          <View style={[styles.currentTimeIndicator, { top: indicatorTop }]}>
            <View style={[styles.currentTimeDot, { backgroundColor: isDark ? '#A599FF' : '#6C5CE7' }]} />
            <View style={[styles.currentTimeLine, { backgroundColor: isDark ? '#A599FF' : '#6C5CE7' }]} />
          </View>
        )}

        {/* Free Time Blocks */}
        {freeTimeBlocks.map((ft, i) => (
          <View
            key={`free-${i}`}
            style={[
              styles.staticBlock,
              {
                top: ft.top,
                height: ft.height - 4,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                borderColor: isDark ? colors.border : '#E2E1EA',
                borderStyle: 'dashed',
                borderWidth: 1,
                justifyContent: 'center',
                alignItems: 'center',
              }
            ]}
          >
            <Text style={{ color: isDark ? colors.textMuted : colors.textTertiary, fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs }}>
              Free Time
            </Text>
          </View>
        ))}

        {/* Class / Lab / Gym Blocks (non-draggable) */}
        {[...classBlocks, gymBlock].filter(Boolean).map((cb: any) => {
          const isPast = isPastDay || (isToday && cb.endFloat < nowHours);
          const isOngoing = !!cb.isOngoing;
          const isAttended = cb.logStatus === 'attended';
          const isMissed = cb.logStatus === 'missed';
          const isCancelled = cb.logStatus === 'cancelled';
          const isUnlogged = cb.logStatus === 'unlogged';

          const blockColors = getStaticBlockColors(cb.type, cb.logStatus, isOngoing, isPast, isDark);

          return (
            <TouchableOpacity
              key={cb.id}
              activeOpacity={0.8}
              onPress={() => handleStaticBlockPress(cb)}
              style={[
                styles.staticBlock,
                {
                  top: cb.top,
                  height: cb.height,
                  backgroundColor: blockColors.bgColor,
                  borderColor: blockColors.borderColor,
                  borderLeftWidth: 4,
                  borderLeftColor: blockColors.accentColor,
                  borderTopWidth: 1,
                  borderRightWidth: 1,
                  borderBottomWidth: 1,
                }
              ]}
            >
              <View style={styles.classBlockHeader}>
                <Ionicons
                  name={blockColors.iconName as any}
                  size={12}
                  color={blockColors.tagColor}
                  style={{ marginRight: 2 }}
                />
                <Text style={[styles.classTypeTag, { color: blockColors.tagColor }]}>
                  {blockColors.badgeText}
                </Text>
              </View>
              <Text
                style={[
                  styles.taskTitle,
                  {
                    color: blockColors.isLineThrough || (isPast && isUnlogged) ? colors.textMuted : colors.textPrimary,
                    textDecorationLine: blockColors.isLineThrough ? 'line-through' : 'none',
                  }
                ]}
                numberOfLines={1}
              >
                {cb.title}
              </Text>
              <View style={styles.taskSubtext}>
                <Ionicons name="time-outline" size={11} color={colors.textMuted} style={{ marginRight: 3 }} />
                <Text style={[styles.taskTime, { color: colors.textMuted }]}>
                  {cb.time}{cb.room ? ` • ${cb.room}` : ''}
                </Text>
              </View>

              {/* Hatch overlay for past/done/missed */}
              {(isPast || cb.isDone || isMissed) && blockColors.hatchColor !== 'transparent' && (
                <HatchOverlay width={500} height={cb.height} color={blockColors.hatchColor} id={cb.id} />
              )}
            </TouchableOpacity>
          );
        })}

        {/* Draggable Task Blocks */}
        {positionedTasks.map((pt) => {
          if (!pt) return null;
          const { task, top, height, durationFloat, startFloat, isMissed, leftPercent, widthPercent } = pt;
          return (
            <DraggableTaskBlock
              key={task.id}
              taskId={task.id}
              title={task.title}
              timeSlot={task.timeSlot!}
              initialTop={top}
              height={height}
              priority={task.priority || 'low'}
              startFloat={startFloat}
              durationFloat={durationFloat}
              startHour={START_HOUR}
              colors={colors}
              isDark={isDark}
              onPress={() => onTaskPress(task)}
              onReschedule={handleReschedule}
              checkCollision={checkCollision}
              isDone={task.status === 'completed'}
              isMissed={isMissed}
              actualMinutes={task.actualMinutes}
              actualStartTime={task.actualStartTime}
              leftPercent={leftPercent}
              widthPercent={widthPercent}
            />
          );
        })}
      </View>
    </ScrollView>
  );
});

export default TimelineView;
