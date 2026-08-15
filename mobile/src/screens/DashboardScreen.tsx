import React from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Image, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LEVEL_THRESHOLDS } from '../services/xpSystem';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { makeStyles } from './dashboard/dashboardStyles';
import { useDashboardData } from './dashboard/useDashboardData';
import { getLevel } from './dashboard/useXPLevel';
import { UnifiedLifeWidget } from '../components/Dashboard/UnifiedLifeWidget';
import { AgendaWidget } from '../components/Dashboard/AgendaWidget';
import AnimatedPressable from '../components/AnimatedPressable';
import SaraHUDBanner from '../components/SARA/SaraHUDBanner';
import QuickCaptureSheet from '../components/Dashboard/QuickCaptureSheet';
import DashboardLayoutSheet from '../components/Dashboard/DashboardLayoutSheet';
import WaterLogSheet from '../components/Dashboard/WaterLogSheet';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const data = useDashboardData();
  const paddingBottom = insets.bottom + 80;
  const levelInfo = getLevel(data.xp);

  const todayTasks = data.tasks.filter(t => t.date === data.todayStr);
  const doneTasksCount = todayTasks.filter(t => t.status === 'completed').length;
  
  const habitsCompleted = data.allHabits.filter(h => {
    const log = data.habitLogs.find(l => l.habitId === h.id && l.date === data.todayStr);
    return log && log.count >= (h.targetCount || 1);
  }).length;
  
  const waterCompleted = (data.waterLogs || []).filter(w => w.date === data.todayStr).reduce((sum, log) => sum + log.amountMl, 0);
  const contentCount = (data.contentLogs || []).length;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <SaraHUDBanner
        message={data.surfaceMessage || ''}
        visible={!!data.surfaceMessage}
        onDismiss={data.dismissBanner}
        actionLabel={data.surfaceActionLabel || undefined}
      />
      
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom }]} showsVerticalScrollIndicator={false}>
          
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={s.greetingContainer}>
            <View>
              <Text style={s.greetingGood}>Good</Text>
              <Text style={s.greetingTime}>{data.timeGreeting}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <AnimatedPressable
                style={s.headerStreakPill}
                onPress={() => navigation.navigate('MoreStack', { screen: 'StreakDetail' })}
              >
                <Text style={{ fontSize: 14 }}>🔥</Text>
                <Text style={s.headerStreakText}>
                  {data.appStreak}
                </Text>
              </AnimatedPressable>
              <AnimatedPressable style={s.avatarCircle} onPress={() => data.setLayoutSheetVisible(true)}>
                <Ionicons name="options-outline" size={22} color={colors.textPrimary} />
              </AnimatedPressable>
              <AnimatedPressable style={s.avatarCircle} onPress={() => navigation.navigate('MoreStack', { screen: 'Settings' })}>
                {data.user?.photoURL ? (
                  <Image source={{ uri: data.user.photoURL }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                ) : (
                  <Text style={s.avatarText}>{data.avatarLetter}</Text>
                )}
              </AnimatedPressable>
            </View>
          </Animated.View>

          {data.layout.map((layoutItem) => {
            if (layoutItem.hidden) return null;

            if (layoutItem.id === 'quote') {
              return (
                <Animated.View key={"quote" as any} entering={FadeInDown.delay(200).duration(400)} style={{ marginTop: 18, marginBottom: 14 }}>
                  <Text style={s.quoteText}>"{data.quote.text}"</Text>
                  <Text style={s.quoteAuthor}>— {data.quote.author}</Text>
                </Animated.View>
              );
            }

            if (layoutItem.id === 'stats') {
              return (
                <Animated.View key={"stats" as any} entering={FadeInDown.delay(300).duration(400)}>
                  <UnifiedLifeWidget
                    currentStreak={data.appStreak}
                    streakAtRisk={false}
                    agendaCompleted={doneTasksCount}
                    agendaTotal={todayTasks.length}
                    habitsCompleted={habitsCompleted}
                    habitsTotal={data.allHabits.length}
                    waterCompleted={waterCompleted}
                    waterTotal={data.waterTotal}
                    classesAttendedToday={data.classesAttendedToday}
                    classesTotalToday={data.classesTotalToday}
                    overallAttendancePct={data.overallAttendancePct}
                    levelLabel={levelInfo.label}
                    levelNextLabel={levelInfo.nextLabel}
                    levelXP={data.xp}
                    levelNextXP={levelInfo.nextXP}
                    levelProgress={levelInfo.progress}
                    showXPSection={!data.layout.find(l => l.id === 'xp')?.hidden}
                    showCapture={!data.layout.find(l => l.id === 'capture')?.hidden}
                    urgentAssignments={[]}
                    nextClass={data.nextClass}
                    onPressStreak={() => navigation.navigate('MoreStack', { screen: 'StreakDetail' })}
                    onPressHabits={() => navigation.navigate('Habits')}
                    onPressWater={() => data.setWaterLogVisible(true)}
                    onPressAttendance={() => navigation.navigate('Attendance')}
                    onPressXP={() => navigation.navigate('MoreStack', { screen: 'XPConstellation' })}
                    onPressRing={() => navigation.navigate(data.nextClass ? 'Attendance' : 'Tasks')}
                    onCapture={() => data.setCaptureVisible(true)}
                  />
                </Animated.View>
              );
            }

            if (layoutItem.id === 'agenda') {
              return (
                <Animated.View key={"agenda" as any} entering={FadeInDown.delay(400).duration(400)}>
                  <AgendaWidget
                    tasks={data.tasks}
                    gymLogs={data.gymLogs}
                    userGymPlan={data.userGymPlan}
                    attendance={data.attendance}
                    attendanceLogs={data.attendanceLogs}
                    todayStr={data.todayStr}
                    nowDate={data.nowDate}
                  />
                </Animated.View>
              );
            }
            return null;
          })}
        </ScrollView>
      </KeyboardAvoidingView>

      <DashboardLayoutSheet 
        visible={data.layoutSheetVisible}
        onClose={() => data.setLayoutSheetVisible(false)}
        layout={data.layout}
        setLayout={data.setLayout}
      />
      <QuickCaptureSheet visible={data.captureVisible} onClose={() => data.setCaptureVisible(false)} />
      <WaterLogSheet 
        visible={data.waterLogVisible} 
        onClose={() => data.setWaterLogVisible(false)}
        userId={data.user?.uid || ''}
        target={data.waterTotal}
        onUpdateTarget={(val) => {
          data.setWaterTotal(val);
        }}
      />
    </SafeAreaView>
  );
}
