import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform, SafeAreaView, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { hapticMedium, hapticLight, hapticSelection } from '../../utils/haptics';
import { useTheme } from "../../contexts/ThemeContext";
import { UserGymPlanDoc, GymPlanDay } from '../../types/gym.types';
import { GYM_PLAN } from '../../data/gymPlan';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Weekly Plan
  userGymPlan: UserGymPlanDoc | null;
  onSaveWeekly: (newCustomDays: Record<number, GymPlanDay>) => Promise<void>;
  // Today's Override
  currentStartTime?: string;
  currentEndTime?: string;
  onSaveOverride: (start: string, end: string) => void;
  // Notifications
  onNotifSaved?: () => void;
}

export function GymScheduleSettingsModal({ 
  visible, onClose, 
  userGymPlan, onSaveWeekly,
  currentStartTime, currentEndTime, onSaveOverride,
  onNotifSaved 
}: Props) {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [activeTab, setActiveTab] = useState<'weekly' | 'today' | 'reminders'>('weekly');

  // --- WEEKLY TAB STATE ---
  const [localDays, setLocalDays] = useState<Record<number, GymPlanDay>>({});
  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(null);
  const [showPickerWeekly, setShowPickerWeekly] = useState<'start' | 'end' | null>(null);
  const [tempStartTimeWeekly, setTempStartTimeWeekly] = useState<Date>(new Date());
  const [tempEndTimeWeekly, setTempEndTimeWeekly] = useState<Date>(new Date());

  // --- TODAY OVERRIDE STATE ---
  const [overrideStart, setOverrideStart] = useState<Date>(new Date());
  const [overrideEnd, setOverrideEnd] = useState<Date>(new Date());
  const [showPickerToday, setShowPickerToday] = useState<'start' | 'end' | null>(null);

  // --- REMINDERS STATE ---
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [notifTime, setNotifTime] = useState<Date>(new Date());
  const [showPickerNotif, setShowPickerNotif] = useState(false);

  useEffect(() => {
    if (visible) {
      // 1. Init Weekly
      const initDays: Record<number, GymPlanDay> = {};
      for (let i = 1; i <= 7; i++) {
        const customDay = userGymPlan?.customDays?.[i];
        if (customDay) {
          initDays[i] = JSON.parse(JSON.stringify(customDay));
        } else {
          const templateDay = GYM_PLAN.find(d => d.dayIndex === i);
          if (templateDay) {
            initDays[i] = JSON.parse(JSON.stringify(templateDay));
          }
        }
      }
      setLocalDays(initDays);

      // 2. Init Today
      const sd = new Date();
      if (currentStartTime) {
        const [h, m] = currentStartTime.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) sd.setHours(h, m, 0, 0);
      } else {
        sd.setHours(17, 0, 0, 0);
      }
      setOverrideStart(sd);

      const ed = new Date();
      if (currentEndTime) {
        const [h, m] = currentEndTime.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) ed.setHours(h, m, 0, 0);
      } else {
        ed.setHours(sd.getHours() + 1, sd.getMinutes(), 0, 0);
      }
      setOverrideEnd(ed);

      // 3. Init Reminders
      loadNotifSettings();
    }
  }, [visible, userGymPlan, currentStartTime, currentEndTime]);

  // --- REMINDERS LOGIC ---
  const loadNotifSettings = async () => {
    const enabledStr = await AsyncStorage.getItem('@gym_notification_enabled');
    setNotifEnabled(enabledStr !== 'false');

    const timeStr = await AsyncStorage.getItem('@gym_notification_time');
    const d = new Date();
    if (timeStr) {
      const [h, m] = timeStr.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        d.setHours(h, m, 0, 0);
      }
    } else {
      d.setHours(18, 0, 0, 0);
    }
    setNotifTime(d);
  };

  const handleSaveNotif = async () => {
    hapticMedium();
    await AsyncStorage.setItem('@gym_notification_enabled', notifEnabled.toString());
    const hours = notifTime.getHours();
    const minutes = notifTime.getMinutes().toString().padStart(2, '0');
    await AsyncStorage.setItem('@gym_notification_time', `${hours}:${minutes}`);
    onNotifSaved?.();
    Alert.alert('Saved', 'Gym reminders updated.');
  };

  // --- WEEKLY LOGIC ---
  const handleSaveWeekly = async () => {
    hapticMedium();
    await onSaveWeekly(localDays);
    Alert.alert('Saved', 'Weekly gym schedule updated.');
  };

  const handleDayPressWeekly = (dayIndex: number) => {
    hapticLight();
    setEditingDayIdx(dayIndex);
    const day = localDays[dayIndex];
    const startD = new Date();
    startD.setHours(17, 0, 0, 0);
    if (day?.startTime) {
      const [h, m] = day.startTime.split(':').map(Number);
      if (!isNaN(h)) startD.setHours(h, m, 0, 0);
    }
    const endD = new Date();
    endD.setHours(18, 0, 0, 0);
    if (day?.endTime) {
      const [h, m] = day.endTime.split(':').map(Number);
      if (!isNaN(h)) endD.setHours(h, m, 0, 0);
    } else {
      endD.setHours(startD.getHours() + 1, startD.getMinutes(), 0, 0);
    }
    setTempStartTimeWeekly(startD);
    setTempEndTimeWeekly(endD);
  };

  const saveEditedDayWeekly = () => {
    if (editingDayIdx === null) return;
    hapticLight();
    const startStr = `${tempStartTimeWeekly.getHours().toString().padStart(2, '0')}:${tempStartTimeWeekly.getMinutes().toString().padStart(2, '0')}`;
    const endStr = `${tempEndTimeWeekly.getHours().toString().padStart(2, '0')}:${tempEndTimeWeekly.getMinutes().toString().padStart(2, '0')}`;
    setLocalDays(prev => ({
      ...prev,
      [editingDayIdx]: { ...prev[editingDayIdx], startTime: startStr, endTime: endStr }
    }));
    setEditingDayIdx(null);
  };
  
  const clearEditedDayWeekly = () => {
    if (editingDayIdx === null) return;
    hapticLight();
    setLocalDays(prev => {
      const updated = { ...prev[editingDayIdx] };
      delete updated.startTime;
      delete updated.endTime;
      return { ...prev, [editingDayIdx]: updated };
    });
    setEditingDayIdx(null);
  };

  // --- TODAY LOGIC ---
  const handleSaveToday = () => {
    hapticMedium();
    const startStr = `${overrideStart.getHours().toString().padStart(2, '0')}:${overrideStart.getMinutes().toString().padStart(2, '0')}`;
    const endStr = `${overrideEnd.getHours().toString().padStart(2, '0')}:${overrideEnd.getMinutes().toString().padStart(2, '0')}`;
    onSaveOverride(startStr, endStr);
    Alert.alert('Saved', 'Today\'s override applied.');
  };

  // --- HELPERS ---
  const formatTime = (d: Date | string | undefined) => {
    if (!d) return 'Not Set';
    if (typeof d === 'string') {
      const [hStr, mStr] = d.split(':');
      let h = parseInt(hStr, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${mStr} ${ampm}`;
    }
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <SafeAreaView style={{ flex: 1 }}>
            
            {/* Header */}
            <View style={s.header}>
              <Text style={s.title}>Gym Settings</Text>
              <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            {editingDayIdx === null && (
              <View style={s.tabsContainer}>
                {['weekly', 'today', 'reminders'].map(tab => (
                  <TouchableOpacity
                    key={tab}
                    style={[s.tabBtn, activeTab === tab && s.tabBtnActive]}
                    onPress={() => { hapticLight(); setActiveTab(tab as any); }}
                  >
                    <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
                      {tab === 'weekly' ? 'Weekly' : tab === 'today' ? 'Today' : 'Reminders'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <ScrollView style={s.contentContainer} showsVerticalScrollIndicator={false}>
              {/* --- WEEKLY TAB --- */}
              {activeTab === 'weekly' && editingDayIdx === null && (
                <>
                  <Text style={s.description}>
                    Set your regular workout times for each day of the week. These will automatically block out time in your calendar.
                  </Text>
                  {dayNames.map((dayName, idx) => {
                    const dayIndex = idx + 1;
                    const planDay = localDays[dayIndex];
                    if (!planDay) return null;
                    const isRest = planDay.isRest;

                    return (
                      <TouchableOpacity 
                        key={dayIndex} 
                        style={[s.dayRow, isRest && s.dayRowRest]}
                        onPress={() => handleDayPressWeekly(dayIndex)}
                        activeOpacity={0.7}
                      >
                        <View style={s.dayInfo}>
                          <Text style={[s.dayName, isRest && s.dayNameRest]}>{dayName}</Text>
                          <Text style={[s.planFocus, isRest && s.planFocusRest]}>
                            {isRest ? '🧘 Rest Day (Weekly Recap)' : planDay.name || planDay.focus || 'Workout'}
                          </Text>
                        </View>
                        {isRest ? (
                          <View style={{ backgroundColor: 'rgba(255,159,77,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,159,77,0.25)' }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#ff9f4d' }}>REST</Text>
                          </View>
                        ) : (
                          <View style={s.timeBlock}>
                            {planDay.startTime ? (
                              <View>
                                <Text style={s.timeText}>{formatTime(planDay.startTime)}</Text>
                                <Text style={s.timeSubText}>to {formatTime(planDay.endTime)}</Text>
                              </View>
                            ) : (
                              <Text style={s.notSetText}>Tap to set time</Text>
                            )}
                            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 8 }} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                  <View style={{ height: 20 }} />
                  <TouchableOpacity style={s.saveBtn} onPress={handleSaveWeekly}>
                    <Text style={s.saveBtnText}>Save Weekly Schedule</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* --- WEEKLY TAB -> EDIT DAY --- */}
              {activeTab === 'weekly' && editingDayIdx !== null && (
                <View style={s.editContainer}>
                  <View style={s.editHeader}>
                    <TouchableOpacity onPress={() => setEditingDayIdx(null)} style={s.closeBtn}>
                      <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[s.title, { fontSize: FONT_SIZE.lg }]}>{dayNames[editingDayIdx - 1]}</Text>
                    <View style={{ width: 24 }} />
                  </View>

                  {/* Day Type Toggle: Workout vs Rest */}
                  <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 4, marginBottom: 16 }}>
                      <TouchableOpacity
                        style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: !localDays[editingDayIdx]?.isRest ? colors.accentPrimary : 'transparent' }}
                        onPress={() => {
                          hapticLight();
                          setLocalDays(prev => {
                            const currentDay = prev[editingDayIdx];
                            let defaultExercises = currentDay?.exercises || [];
                            if (!defaultExercises || defaultExercises.length === 0) {
                              const templateDay = GYM_PLAN.find(d => d.dayIndex === editingDayIdx);
                              if (templateDay && !templateDay.isRest && templateDay.exercises?.length > 0) {
                                defaultExercises = JSON.parse(JSON.stringify(templateDay.exercises));
                              } else {
                                const sampleDay = GYM_PLAN.find(d => !d.isRest && d.exercises?.length > 0);
                                if (sampleDay) {
                                  defaultExercises = JSON.parse(JSON.stringify(sampleDay.exercises));
                                }
                              }
                            }
                            return {
                              ...prev,
                              [editingDayIdx]: {
                                ...currentDay,
                                isRest: false,
                                name: (!currentDay?.name || currentDay?.name === 'Rest & Recovery' || currentDay?.name === 'Rest Day') ? 'Workout' : currentDay.name,
                                focus: (!currentDay?.focus || currentDay?.focus === 'Rest & Recovery' || currentDay?.focus.includes('recovery')) ? 'Chest & Back' : currentDay.focus,
                                exercises: defaultExercises,
                              }
                            };
                          });
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: !localDays[editingDayIdx]?.isRest ? '#000000' : colors.textSecondary }}>🏋️ Workout Day</Text>
                      </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: localDays[editingDayIdx]?.isRest ? '#ff9f4d' : 'transparent' }}
                      onPress={() => {
                        hapticLight();
                        setLocalDays(prev => ({
                          ...prev,
                          [editingDayIdx]: {
                            ...prev[editingDayIdx],
                            isRest: true,
                            name: 'Rest & Recovery',
                            focus: 'Rest & Recovery',
                            exercises: []
                          }
                        }));
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: localDays[editingDayIdx]?.isRest ? '#000000' : colors.textSecondary }}>🧘 Rest Day</Text>
                    </TouchableOpacity>
                  </View>

                  {localDays[editingDayIdx]?.isRest ? (
                    <View style={{ backgroundColor: 'rgba(255,159,77,0.08)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,159,77,0.2)', marginBottom: 24 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#ff9f4d', marginBottom: 4 }}>Rest Day Configured</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
                        This day will automatically show your Weekly Gym Recap and Performance Report instead of an exercise list.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={s.editSubtitle}>{localDays[editingDayIdx]?.name || localDays[editingDayIdx]?.focus}</Text>
                      
                      <View style={s.timeRow}>
                        <Text style={s.timeRowTitle}>Start Time</Text>
                        <TouchableOpacity style={s.timeBtn} onPress={() => setShowPickerWeekly('start')}>
                          <Text style={s.timeBtnText}>{formatTime(tempStartTimeWeekly)}</Text>
                        </TouchableOpacity>
                      </View>
                      {showPickerWeekly === 'start' && (
                        <View style={s.pickerWrapper}>
                          <DateTimePicker
                            value={tempStartTimeWeekly} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(_, date) => {
                              if (Platform.OS === 'android') setShowPickerWeekly(null);
                              if (date) {
                                setTempStartTimeWeekly(date);
                                const newEnd = new Date(date); newEnd.setHours(date.getHours() + 1); setTempEndTimeWeekly(newEnd);
                              }
                            }}
                            textColor={colors.textPrimary}
                          />
                          {Platform.OS === 'ios' && (
                            <TouchableOpacity style={s.pickerDoneBtn} onPress={() => setShowPickerWeekly(null)}>
                              <Text style={s.pickerDoneText}>Done</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      <View style={s.timeRow}>
                        <Text style={s.timeRowTitle}>End Time</Text>
                        <TouchableOpacity style={s.timeBtn} onPress={() => setShowPickerWeekly('end')}>
                          <Text style={s.timeBtnText}>{formatTime(tempEndTimeWeekly)}</Text>
                        </TouchableOpacity>
                      </View>
                      {showPickerWeekly === 'end' && (
                        <View style={s.pickerWrapper}>
                          <DateTimePicker
                            value={tempEndTimeWeekly} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(_, date) => {
                              if (Platform.OS === 'android') setShowPickerWeekly(null);
                              if (date) setTempEndTimeWeekly(date);
                            }}
                            textColor={colors.textPrimary}
                          />
                          {Platform.OS === 'ios' && (
                            <TouchableOpacity style={s.pickerDoneBtn} onPress={() => setShowPickerWeekly(null)}>
                              <Text style={s.pickerDoneText}>Done</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </>
                  )}

                  <View style={{ height: 30 }} />
                  <TouchableOpacity style={[s.saveBtn, { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1, marginBottom: SPACE.md }]} onPress={clearEditedDayWeekly}>
                    <Text style={[s.saveBtnText, { color: colors.textPrimary }]}>Clear Time</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.saveBtn} onPress={saveEditedDayWeekly}>
                    <Text style={s.saveBtnText}>Save {dayNames[editingDayIdx - 1]}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* --- TODAY TAB --- */}
              {activeTab === 'today' && (
                <>
                  <Text style={s.description}>
                    Override your workout time for today only. This won't affect your weekly routine.
                  </Text>
                  <View style={s.timeRow}>
                    <Text style={s.timeRowTitle}>Start Time</Text>
                    <TouchableOpacity style={s.timeBtn} onPress={() => setShowPickerToday('start')}>
                      <Text style={s.timeBtnText}>{formatTime(overrideStart)}</Text>
                    </TouchableOpacity>
                  </View>
                  {showPickerToday === 'start' && (
                    <View style={s.pickerWrapper}>
                      <DateTimePicker
                        value={overrideStart} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, date) => {
                          if (Platform.OS === 'android') setShowPickerToday(null);
                          if (date) {
                            setOverrideStart(date);
                            const newEnd = new Date(date); newEnd.setHours(date.getHours() + 1); setOverrideEnd(newEnd);
                          }
                        }}
                        textColor={colors.textPrimary}
                      />
                      {Platform.OS === 'ios' && (
                        <TouchableOpacity style={s.pickerDoneBtn} onPress={() => setShowPickerToday(null)}>
                          <Text style={s.pickerDoneText}>Done</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  <View style={s.timeRow}>
                    <Text style={s.timeRowTitle}>End Time</Text>
                    <TouchableOpacity style={s.timeBtn} onPress={() => setShowPickerToday('end')}>
                      <Text style={s.timeBtnText}>{formatTime(overrideEnd)}</Text>
                    </TouchableOpacity>
                  </View>
                  {showPickerToday === 'end' && (
                    <View style={s.pickerWrapper}>
                      <DateTimePicker
                        value={overrideEnd} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, date) => {
                          if (Platform.OS === 'android') setShowPickerToday(null);
                          if (date) setOverrideEnd(date);
                        }}
                        textColor={colors.textPrimary}
                      />
                      {Platform.OS === 'ios' && (
                        <TouchableOpacity style={s.pickerDoneBtn} onPress={() => setShowPickerToday(null)}>
                          <Text style={s.pickerDoneText}>Done</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  
                  <View style={{ height: 40 }} />
                  <TouchableOpacity style={s.saveBtn} onPress={handleSaveToday}>
                    <Text style={s.saveBtnText}>Apply Override</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* --- REMINDERS TAB --- */}
              {activeTab === 'reminders' && (
                <>
                  <Text style={s.description}>
                    Get a gentle push notification to work out on your scheduled gym days.
                  </Text>
                  <View style={s.timeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.timeRowTitle}>Enable Reminders</Text>
                    </View>
                    <Switch
                      value={notifEnabled}
                      onValueChange={(val) => { hapticSelection(); setNotifEnabled(val); }}
                      trackColor={{ false: colors.border, true: colors.accentPrimary }}
                      thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
                    />
                  </View>

                  {notifEnabled && (
                    <>
                      <View style={s.timeRow}>
                        <Text style={s.timeRowTitle}>Reminder Time</Text>
                        <TouchableOpacity style={s.timeBtn} onPress={() => setShowPickerNotif(true)}>
                          <Text style={s.timeBtnText}>{formatTime(notifTime)}</Text>
                        </TouchableOpacity>
                      </View>
                      {showPickerNotif && (
                        <View style={s.pickerWrapper}>
                          <DateTimePicker
                            value={notifTime} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(_, date) => {
                              if (Platform.OS === 'android') setShowPickerNotif(false);
                              if (date) setNotifTime(date);
                            }}
                            textColor={colors.textPrimary}
                          />
                          {Platform.OS === 'ios' && (
                            <TouchableOpacity style={s.pickerDoneBtn} onPress={() => setShowPickerNotif(false)}>
                              <Text style={s.pickerDoneText}>Done</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </>
                  )}

                  <View style={{ height: 40 }} />
                  <TouchableOpacity style={s.saveBtn} onPress={handleSaveNotif}>
                    <Text style={s.saveBtnText}>Save Notification Settings</Text>
                  </TouchableOpacity>
                </>
              )}
              
              <View style={{ height: 100 }} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    height: '90%',
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.sm,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xl,
    color: colors.textPrimary,
  },
  description: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
    marginBottom: SPACE.lg,
    lineHeight: 20,
  },
  closeBtn: {
    padding: SPACE.xs,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceHighlight,
    borderRadius: RADIUS.lg,
    padding: 4,
    marginBottom: SPACE.lg,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: RADIUS.md,
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
  },
  tabTextActive: {
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
  },
  contentContainer: {
    flex: 1,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayRowRest: {
    opacity: 0.5,
  },
  dayInfo: {
    flex: 1,
  },
  dayName: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  dayNameRest: {
    color: colors.textMuted,
  },
  planFocus: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.xs,
    color: colors.accentPrimary,
  },
  planFocusRest: {
    color: colors.textMuted,
  },
  timeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  timeSubText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.xs,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 2,
  },
  notSetText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: colors.textMuted,
  },
  saveBtn: {
    backgroundColor: isDark ? '#FFFFFF' : colors.accentPrimary,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: isDark ? '#000000' : '#FFFFFF',
  },
  editContainer: {
    paddingTop: SPACE.sm,
  },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.md,
  },
  editSubtitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.accentPrimary,
    marginBottom: SPACE.xl,
    marginLeft: SPACE.sm,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACE.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: SPACE.md,
  },
  timeRowTitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
  },
  timeBtn: {
    backgroundColor: colors.surfaceHighlight,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
  },
  timeBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.lg,
    color: colors.textPrimary,
  },
  pickerWrapper: {
    alignItems: 'center',
    paddingVertical: SPACE.sm,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: RADIUS.md,
    marginBottom: SPACE.lg,
  },
  pickerDoneBtn: {
    alignSelf: 'flex-end',
    padding: SPACE.md,
  },
  pickerDoneText: {
    color: colors.accentPrimary,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
  },
});
