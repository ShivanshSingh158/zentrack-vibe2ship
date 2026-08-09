import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { makeStyles } from './dashboard/dashboardStyles';
import { useDashboardData } from './dashboard/useDashboardData';
import { getLevel } from './dashboard/useXPLevel';
import { UnifiedLifeWidget } from '../components/Dashboard/UnifiedLifeWidget';
import AnimatedPressable from '../components/AnimatedPressable';
import SaraHUDBanner from '../components/SARA/SaraHUDBanner';
import { DashboardRings } from '../components/Dashboard/DashboardRings';
import QuickCaptureSheet from '../components/Dashboard/QuickCaptureSheet';
import DashboardLayoutSheet from '../components/Dashboard/DashboardLayoutSheet';
import WaterLogSheet from '../components/Dashboard/WaterLogSheet';
import SleepLogSheet from '../components/Dashboard/SleepLogSheet';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const data = useDashboardData();
  const paddingBottom = insets.bottom + 80;
  const levelInfo = getLevel(data.xp);

  // Simplified stats calculation for the widget (these should eventually move to a hook too, but we keep them here to make the widget work)
  const todayTasks = data.tasks.filter(t => t.date === data.todayStr);
  const doneTasksCount = todayTasks.filter(t => t.status === 'completed').length;
  
  const habitsCompleted = data.allHabits.filter(h => {
    const log = data.habitLogs.find(l => l.habitId === h.id && l.date === data.todayStr);
    return log && log.count >= (h.targetCount || 1);
  }).length;
  
  const waterCompleted = (data.waterLogs || []).filter(w => w.date === data.todayStr).reduce((sum, log) => sum + log.amountMl, 0);
  const sleepInfo = (data.sleepLogs || []).sort((a,b) => b.date.localeCompare(a.date))[0];
  const lastNightSleep = sleepInfo ? sleepInfo.hours : null;

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
              <AnimatedPressable style={s.avatarCircle} onPress={() => data.setLayoutSheetVisible(true)}>
                <Ionicons name="options-outline" size={22} color={colors.textPrimary} />
              </AnimatedPressable>
            </View>
          </Animated.View>

          {data.layout.map((layoutItem) => {
            if (layoutItem.hidden) return null;

            if (layoutItem.id === 'quote') {
              return (
                <Animated.View key="quote" entering={FadeInDown.delay(200).duration(400)} style={{ marginTop: 24, marginBottom: 12 }}>
                  <Text style={s.quoteText}>"{data.quote.text}"</Text>
                  <Text style={s.quoteAuthor}>— {data.quote.author}</Text>
                </Animated.View>
              );
            }

            if (layoutItem.id === 'stats') {
              return (
                <Animated.View key="stats" entering={FadeInDown.delay(300).duration(400)}>
                  <UnifiedLifeWidget
                    currentStreak={0}
                    streakAtRisk={false}
                    agendaCompleted={doneTasksCount}
                    agendaTotal={todayTasks.length}
                    habitsCompleted={habitsCompleted}
                    habitsTotal={data.allHabits.length}
                    waterCompleted={waterCompleted}
                    waterTotal={data.waterTotal}
                    lastNightSleep={lastNightSleep}
                    levelLabel={levelInfo.label}
                    levelNextLabel={levelInfo.nextXP.toString()}
                    levelXP={data.xp}
                    levelNextXP={levelInfo.nextXP}
                    levelProgress={levelInfo.progress}
                    urgentAssignments={[]}
                    onPressStreak={() => navigation.navigate('MoreStack', { screen: 'StreakDetail' })}
                    onPressHabits={() => navigation.navigate('Habits')}
                    onPressWater={() => data.setWaterLogVisible(true)}
                    onPressSleep={() => data.setSleepLogVisible(true)}
                    onCapture={() => data.setCaptureVisible(true)}
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
        onUpdateLayout={data.setLayout}
      />
      <QuickCaptureSheet visible={data.captureVisible} onClose={() => data.setCaptureVisible(false)} />
      <WaterLogSheet visible={data.waterLogVisible} onClose={() => data.setWaterLogVisible(false)} />
      <SleepLogSheet visible={data.sleepLogVisible} onClose={() => data.setSleepLogVisible(false)} />
    </SafeAreaView>
  );
}
