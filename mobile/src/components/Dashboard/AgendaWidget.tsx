import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import VoiceDictationOverlay from '../Tasks/VoiceDictationOverlay';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { WEEKDAY_TO_PLAN } from '../../data/gymPlan';
import { getCustomPlanDay } from '../../hooks/useGymLog';
import { parseTimeToMins, getEndTimeMins, formatTimeStr } from '../../utils/timeUtils';

interface AgendaWidgetProps {
  tasks: any[];
  gymLogs: any[];
  userGymPlan: any;
  attendance: any[];
  attendanceLogs: any[];
  todayStr: string;
  nowDate: Date;
  holidays?: string[];
  /** Pass data.user?.uid from DashboardScreen — avoids subscribing to the full CoreDataContext */
  userId?: string;
  onToggleTask?: (task: any) => void;
}

export const AgendaWidget = React.memo(function AgendaWidget({
  tasks,
  gymLogs,
  userGymPlan,
  attendance,
  attendanceLogs,
  todayStr,
  nowDate,
  holidays = [],
  userId,
  onToggleTask,
}: AgendaWidgetProps) {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const [isVoiceDictationOpen, setIsVoiceDictationOpen] = useState(false);

  // Memoized to prevent agendaItems recomputing every 60s clock tick when items haven't changed
  const nowMins = useMemo(() => nowDate.getHours() * 60 + nowDate.getMinutes(), [nowDate]);

  const { todayTasks, todayClasses, todayGym, shouldShowGymInAgenda, plannedDay } = useMemo(() => {
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

    return { todayTasks, todayClasses, todayGym, shouldShowGymInAgenda, plannedDay };
  }, [tasks, gymLogs, userGymPlan, attendance, attendanceLogs, todayStr, nowDate, holidays]);

  // ── Memoized Agenda Items Generation & Sorting ───────────────────────────
  const agendaItems = useMemo(() => {
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
          type: 'gym',
          title: gymTitle,
          timeStr: gymTimeStr,
          timeMins: isGymCompleted ? -1 : gymTimeMins,
          isCompleted: isGymCompleted,
          isMissed: false,
          isCancelled: false,
          icon: isGymCompleted ? 'checkmark-circle' : 'barbell-outline',
          iconColor: isGymCompleted ? colors.accentGreen : colors.accentPrimary,
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
        type: c.type || 'class',
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
      const isCancelled = t.status === 'cancelled';
      const isCompleted = t.status === 'completed' || t.status === 'done';
      let isOverdue = false;

      if (!isCompleted && !isCancelled && t.timeSlot) {
        const endTimeMins = getEndTimeMins(t.timeSlot);
        if (nowMins > endTimeMins) {
          isOverdue = true;
        }
      }

      let icon = 'ellipse-outline';
      let iconColor = colors.textTertiary;

      if (isCompleted) {
        icon = 'checkmark-circle';
        iconColor = colors.accentGreen;
      } else if (isCancelled) {
        icon = 'remove-circle';
        iconColor = colors.textTertiary;
      } else if (isOverdue) {
        icon = 'ellipse-outline';
        iconColor = colors.accentAmber;
      }

      items.push({
        id: t.id,
        taskId: t.id,
        type: 'task',
        rawTask: t,
        title: t.title,
        timeStr: t.timeSlot ? formatTimeStr(t.timeSlot) : '',
        timeMins: t.timeSlot ? parseTimeToMins(t.timeSlot) : 9999,
        isCompleted,
        isMissed: false,
        isOverdue,
        isCancelled,
        priority: t.priority,
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
  }, [shouldShowGymInAgenda, todayGym, plannedDay, todayClasses, todayTasks, nowMins, colors, navigation]);

  const { totalCount, completedCount, remainingCount } = useMemo(() => {
    const total = agendaItems.length;
    const completed = agendaItems.filter(i => i.isCompleted).length;
    return { totalCount: total, completedCount: completed, remainingCount: total - completed };
  }, [agendaItems]);

  const handleTaskCheckboxPress = useCallback((item: any) => {
    if (item.rawTask && onToggleTask) {
      onToggleTask(item.rawTask);
    } else {
      item.onPress?.();
    }
  }, [onToggleTask]);

  return (
    <View style={styles.container}>
      {/* ── Header: Subhead tracking + Count Pill ── */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Tasks')}
          style={styles.headerTitleRow}
        >
          <Ionicons name="calendar-outline" size={13} color={colors.accentPrimary} style={{ marginRight: 6 }} />
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
            TODAY'S AGENDA
          </Text>
        </TouchableOpacity>

        {totalCount > 0 && (
          <View style={[
            styles.countPill,
            { backgroundColor: remainingCount === 0 ? 'rgba(94,218,158,0.12)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }
          ]}>
            {remainingCount === 0 ? (
              <>
                <Ionicons name="checkmark-circle" size={12} color={colors.accentGreen} style={{ marginRight: 4 }} />
                <Text style={[styles.countPillText, { color: colors.accentGreen }]}>All Done</Text>
              </>
            ) : (
              <Text style={[styles.countPillText, { color: isDark ? colors.textSecondary : colors.textPrimary }]}>
                {remainingCount} Left
              </Text>
            )}
          </View>
        )}
      </View>

      {/* ── Grouped Inset Card (Apple iOS 18 Squircle Surface) ── */}
      <View style={[
        styles.groupedCard,
        {
          backgroundColor: isDark ? '#0d0d10' : '#FFFFFF',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E5E5EA',
        }
      ]}>
        {agendaItems.length === 0 ? (
          <View style={styles.emptyCardContent}>
            <View style={[styles.emptyIconCircle, { backgroundColor: 'rgba(94,218,158,0.12)' }]}>
              <Ionicons name="sparkles" size={24} color={colors.accentGreen} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              All Caught Up
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              No tasks or sessions scheduled for today. Take a breather or start an activity!
            </Text>

            <View style={styles.emptyActionsRow}>
              <TouchableOpacity
                style={[styles.quickActionBtn, { backgroundColor: colors.accentPrimary }]}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate('Tasks', { openAddTask: true });
                }}
              >
                <Ionicons name="add" size={15} color={isDark ? '#000000' : '#FFFFFF'} />
                <Text style={[styles.quickActionTextPrimary, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                  Add Task
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionBtn, styles.emptyVoiceBtn]}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setIsVoiceDictationOpen(true);
                }}
              >
                <Ionicons name="mic" size={15} color="#FFFFFF" />
                <Text style={styles.quickVoiceText}>Voice</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {agendaItems.map((item, index) => {
              const isLast = index === agendaItems.length - 1;
              const isTask = item.type === 'task';
              const shouldStrike = item.isCompleted || item.isMissed || item.isCancelled;

              let textColor = colors.textPrimary;
              let timeColor = colors.textTertiary;
              if (shouldStrike) {
                textColor = colors.textTertiary;
                timeColor = colors.textTertiary;
              } else if (item.isOverdue) {
                textColor = colors.textPrimary;
                timeColor = colors.accentAmber;
              }

              return (
                <View key={item.id}>
                  <View style={styles.itemRowContainer}>
                    {/* Left: Interactive Checkbox for Tasks, or Category Icon Squircle */}
                    {isTask ? (
                      <Pressable
                        hitSlop={10}
                        onPress={() => handleTaskCheckboxPress(item)}
                        style={styles.checkboxTouch}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: item.isCompleted }}
                        accessibilityLabel={`Mark ${item.title} as ${item.isCompleted ? 'pending' : 'complete'}`}
                      >
                        {item.isCompleted ? (
                          <View style={[styles.checkboxCompleted, { backgroundColor: colors.accentGreen }]}>
                            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                          </View>
                        ) : (
                          <View style={[
                            styles.checkboxPending,
                            { borderColor: isDark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.22)' }
                          ]} />
                        )}
                      </Pressable>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={item.onPress}
                        style={[
                          styles.categoryIconBadge,
                          {
                            backgroundColor: item.type === 'gym'
                              ? (item.isCompleted ? 'rgba(94,218,158,0.12)' : 'rgba(165,153,255,0.12)')
                              : item.type === 'lab'
                                ? (item.isCompleted ? 'rgba(94,218,158,0.12)' : 'rgba(255,159,77,0.12)')
                                : (item.isCompleted ? 'rgba(94,218,158,0.12)' : 'rgba(99,102,241,0.12)')
                          }
                        ]}
                      >
                        <Ionicons
                          name={item.icon}
                          size={15}
                          color={item.iconColor}
                        />
                      </TouchableOpacity>
                    )}

                    {/* Middle: Title & Time */}
                    <TouchableOpacity
                      style={styles.itemContentTouch}
                      activeOpacity={0.65}
                      onPress={item.onPress}
                    >
                      <Text
                        style={[
                          styles.itemTitle,
                          { color: textColor },
                          shouldStrike && styles.strikethroughText
                        ]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>

                      {(!!item.timeStr || item.isOverdue) && (
                        <View style={styles.timeRow}>
                          <Text
                            style={[
                              styles.itemTime,
                              { color: timeColor },
                              shouldStrike && styles.strikethroughText
                            ]}
                            numberOfLines={1}
                          >
                            {item.isOverdue
                              ? (item.timeStr ? `${item.timeStr} • Overdue` : 'Overdue')
                              : item.timeStr}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Right: Chevron arrow */}
                    <TouchableOpacity
                      activeOpacity={0.6}
                      onPress={item.onPress}
                      style={styles.chevronTouch}
                      hitSlop={8}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={15}
                        color={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.20)'}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Indented Divider (starts where title begins) */}
                  {!isLast && (
                    <View style={[
                      styles.rowDivider,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }
                    ]} />
                  )}
                </View>
              );
            })}

            {/* Quick Action Footer inside Card */}
            <View style={[
              styles.cardFooter,
              { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }
            ]}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate('Tasks', { openAddTask: true });
                }}
                style={styles.footerActionBtn}
              >
                <Ionicons name="add" size={15} color={colors.accentPrimary} />
                <Text style={[styles.footerActionText, { color: colors.accentPrimary }]}>
                  Add task
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setIsVoiceDictationOpen(true);
                }}
                style={styles.footerActionBtn}
              >
                <Ionicons name="mic" size={14} color="#FF453A" />
                <Text style={[styles.footerActionText, { color: '#FF453A' }]}>
                  Voice
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Voice Dictation Sheet */}
      {isVoiceDictationOpen && (
        <VoiceDictationOverlay
          visible={isVoiceDictationOpen}
          onClose={() => setIsVoiceDictationOpen(false)}
          selectedDate={todayStr}
          userId={userId}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countPillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
    letterSpacing: 0.2,
  },
  groupedCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  itemRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  checkboxTouch: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxPending: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.8,
  },
  checkboxCompleted: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemContentTouch: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 8,
  },
  itemTitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  strikethroughText: {
    textDecorationLine: 'line-through',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  itemTime: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 12,
  },
  chevronTouch: {
    paddingLeft: 4,
    paddingVertical: 4,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 50,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  footerActionText: {
    fontFamily: FONT_FAMILY.medium,
    fontWeight: '600',
    fontSize: 12.5,
  },
  emptyCardContent: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
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
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  quickActionTextPrimary: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12.5,
  },
  emptyVoiceBtn: {
    backgroundColor: '#FF453A',
    shadowColor: '#FF453A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  quickVoiceText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12.5,
    color: '#FFFFFF',
  },
});
