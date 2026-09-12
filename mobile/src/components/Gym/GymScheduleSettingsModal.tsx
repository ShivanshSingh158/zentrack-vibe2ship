/**
 * GymScheduleSettingsModal • ZenTrack Mobile
 *
 * Custom 7-day schedule pattern editor (e.g. Tue–Sun with Mon Rest)
 * Pure OLED black Obsidian Cosmos theme with direct time configuration.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView,
  Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { FONT_SIZE } from '../../theme/tokens';
import { hapticMedium, hapticLight } from '../../utils/haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { UserGymPlanDoc, GymPlanDay } from '../../types/gym.types';
import { GYM_PLAN } from '../../data/gymPlan';

// Extracted Subcomponents & Styles
import { makeGymScheduleStyles } from './gymScheduleStyles';
import GymScheduleDayCard from './GymScheduleDayCard';

interface Props {
  visible: boolean;
  onClose: () => void;
  userGymPlan: UserGymPlanDoc | null;
  onSaveWeekly: (newCustomDays: Record<number, GymPlanDay>) => Promise<void>;
  currentStartTime?: string;
  currentEndTime?: string;
  onSaveOverride?: (start: string, end: string) => void;
  onNotifSaved?: () => void;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const QUICK_PRESETS = [
  { label: 'Morning', time: '05:30', end: '07:00' },
  { label: 'Afternoon', time: '15:30', end: '17:00' },
  { label: 'Evening', time: '16:30', end: '18:00' },
  { label: 'Night', time: '19:30', end: '21:00' },
];

export function GymScheduleSettingsModal({
  visible,
  onClose,
  userGymPlan,
  onSaveWeekly,
  onNotifSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeGymScheduleStyles(colors, isDark), [colors, isDark]);

  // --- WEEKLY SCHEDULE STATE ---
  const [localDays, setLocalDays] = useState<Record<number, GymPlanDay>>({});
  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(null);
  const [showPickerWeekly, setShowPickerWeekly] = useState<'start' | 'end' | null>(null);
  const [tempStartTimeWeekly, setTempStartTimeWeekly] = useState<Date>(new Date());
  const [tempEndTimeWeekly, setTempEndTimeWeekly] = useState<Date>(new Date());

  useEffect(() => {
    if (visible) {
      // Init Weekly (immutable shallow copy)
      const initDays: Record<number, GymPlanDay> = {};
      for (let i = 1; i <= 7; i++) {
        const customDay = userGymPlan?.customDays?.[i];
        if (customDay) {
          initDays[i] = { ...customDay, exercises: [...(customDay.exercises || [])] };
        } else {
          const templateDay = GYM_PLAN.find(d => d.dayIndex === i);
          if (templateDay) {
            initDays[i] = { ...templateDay, exercises: [...(templateDay.exercises || [])] };
          }
        }
      }
      setLocalDays(initDays);
      setEditingDayIdx(null);
    }
  }, [visible, userGymPlan]);

  // --- WEEKLY LOGIC ---
  const handleSaveWeekly = async () => {
    hapticMedium();
    await onSaveWeekly(localDays);
    onNotifSaved?.();
    Alert.alert('Schedule Saved', 'Weekly workout schedule updated and synced with alarms.');
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
      [editingDayIdx]: { ...prev[editingDayIdx], startTime: startStr, endTime: endStr },
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={s.card} activeOpacity={1} onPress={e => e.stopPropagation?.()}>
          <View style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 16) }}>
            {/* Header */}
            <View style={s.header}>
              <View>
                <Text style={s.title}>Workout Schedule</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, fontFamily: 'Inter_400Regular' }}>
                  Weekly training windows & calendar slots
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={s.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Close schedule modal"
              >
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Content Container */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={s.contentContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {editingDayIdx === null ? (
                <>
                  <Text style={s.description}>
                    Set your regular workout times for each day of the week. ZenTrack automatically registers alarms and reserves your calendar slots.
                  </Text>

                  {DAY_NAMES.map((dayName, idx) => {
                    const dayIndex = idx + 1;
                    const planDay = localDays[dayIndex];
                    if (!planDay) return null;

                    return (
                      <GymScheduleDayCard
                        key={dayIndex}
                        dayName={dayName}
                        dayIndex={dayIndex}
                        planDay={planDay}
                        onPress={handleDayPressWeekly}
                        formatTime={formatTime}
                        styles={s}
                        colors={colors}
                        isDark={isDark}
                      />
                    );
                  })}

                  <View style={{ height: 10 }} />
                  <TouchableOpacity style={s.saveBtn} onPress={handleSaveWeekly} activeOpacity={0.85}>
                    <Text style={s.saveBtnText}>Save Weekly Schedule</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={s.editContainer}>
                  {/* Edit Header */}
                  <View style={s.editHeader}>
                    <TouchableOpacity
                      onPress={() => setEditingDayIdx(null)}
                      style={s.closeBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[s.title, { fontSize: 17 }]}>{DAY_NAMES[editingDayIdx - 1]} Routine</Text>
                    <View style={{ width: 32 }} />
                  </View>

                  {/* Day Type Selector: Workout vs Rest */}
                  <View
                    style={{
                      flexDirection: 'row',
                      backgroundColor: isDark ? '#0D0D11' : '#F3F4F6',
                      borderRadius: 14,
                      padding: 4,
                      marginBottom: 16,
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
                    }}
                  >
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        alignItems: 'center',
                        borderRadius: 10,
                        backgroundColor: !localDays[editingDayIdx]?.isRest
                          ? colors.accentPrimary
                          : 'transparent',
                      }}
                      onPress={() => {
                        hapticLight();
                        setLocalDays(prev => {
                          const currentDay = prev[editingDayIdx];
                          let defaultExercises = currentDay?.exercises || [];
                          if (!defaultExercises || defaultExercises.length === 0) {
                            const templateDay = GYM_PLAN.find(d => d.dayIndex === editingDayIdx);
                            if (templateDay && !templateDay.isRest && templateDay.exercises?.length > 0) {
                              defaultExercises = [...templateDay.exercises];
                            } else {
                              const sampleDay = GYM_PLAN.find(d => !d.isRest && d.exercises?.length > 0);
                              if (sampleDay) defaultExercises = [...sampleDay.exercises];
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
                            },
                          };
                        });
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '700',
                          color: !localDays[editingDayIdx]?.isRest ? '#000000' : colors.textSecondary,
                        }}
                      >
                        🏋️ Workout Day
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        alignItems: 'center',
                        borderRadius: 10,
                        backgroundColor: localDays[editingDayIdx]?.isRest ? '#FF9F4D' : 'transparent',
                      }}
                      onPress={() => {
                        hapticLight();
                        setLocalDays(prev => ({
                          ...prev,
                          [editingDayIdx]: {
                            ...prev[editingDayIdx],
                            isRest: true,
                            name: 'Rest & Recovery',
                            focus: 'Rest & Recovery',
                            exercises: [],
                          },
                        }));
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '700',
                          color: localDays[editingDayIdx]?.isRest ? '#000000' : colors.textSecondary,
                        }}
                      >
                        🧘 Rest Day
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {!localDays[editingDayIdx]?.isRest && (
                    <>
                      {/* Quick Presets */}
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '600',
                          color: colors.textTertiary,
                          letterSpacing: 0.8,
                          marginBottom: 8,
                          marginLeft: 2,
                        }}
                      >
                        QUICK TIME PRESETS
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                        {QUICK_PRESETS.map(p => (
                          <TouchableOpacity
                            key={p.label}
                            style={{
                              flex: 1,
                              paddingVertical: 8,
                              borderRadius: 10,
                              backgroundColor: isDark ? '#0D0D11' : '#F3F4F6',
                              alignItems: 'center',
                              borderWidth: 1,
                              borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#E5E7EB',
                            }}
                            onPress={() => {
                              hapticLight();
                              const [sh, sm] = p.time.split(':').map(Number);
                              const [eh, em] = p.end.split(':').map(Number);
                              const sD = new Date();
                              sD.setHours(sh, sm, 0, 0);
                              const eD = new Date();
                              eD.setHours(eh, em, 0, 0);
                              setTempStartTimeWeekly(sD);
                              setTempEndTimeWeekly(eD);
                            }}
                          >
                            <Text style={{ fontSize: 10, color: colors.textSecondary, fontWeight: '600' }}>
                              {p.label}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.accentPrimary, fontWeight: '700', marginTop: 2 }}>
                              {formatTime(p.time)}
                            </Text>
                            <Text style={{ fontSize: 9.5, color: colors.textTertiary, marginTop: 1 }}>
                              to {formatTime(p.end)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Start Time Row */}
                      <View style={s.settingRow}>
                        <View>
                          <Text style={s.settingLabel}>Workout Start Time</Text>
                          <Text style={s.settingSub}>When you enter the gym</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setShowPickerWeekly('start')}
                          style={{
                            backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.18)',
                          }}
                        >
                          <Text style={{ color: colors.accentPrimary, fontWeight: '700', fontSize: 13 }}>
                            {formatTime(tempStartTimeWeekly)}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* End Time Row */}
                      <View style={s.settingRow}>
                        <View>
                          <Text style={s.settingLabel}>Workout End Time</Text>
                          <Text style={s.settingSub}>Estimated finish time</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setShowPickerWeekly('end')}
                          style={{
                            backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.18)',
                          }}
                        >
                          <Text style={{ color: colors.accentPrimary, fontWeight: '700', fontSize: 13 }}>
                            {formatTime(tempEndTimeWeekly)}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {showPickerWeekly && (
                        <DateTimePicker
                          value={showPickerWeekly === 'start' ? tempStartTimeWeekly : tempEndTimeWeekly}
                          mode="time"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          onChange={(event, selectedDate) => {
                            setShowPickerWeekly(null);
                            if (selectedDate) {
                              if (showPickerWeekly === 'start') {
                                setTempStartTimeWeekly(selectedDate);
                                const newEnd = new Date(selectedDate);
                                newEnd.setHours(newEnd.getHours() + 1);
                                setTempEndTimeWeekly(newEnd);
                              } else {
                                setTempEndTimeWeekly(selectedDate);
                              }
                            }
                          }}
                        />
                      )}
                    </>
                  )}

                  <View style={{ height: 16 }} />
                  <TouchableOpacity style={s.saveBtn} onPress={saveEditedDayWeekly} activeOpacity={0.85}>
                    <Text style={s.saveBtnText}>Save Time For This Day</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      s.saveBtn,
                      {
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
                        marginTop: 10,
                      },
                    ]}
                    onPress={clearEditedDayWeekly}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.saveBtnText, { color: colors.textSecondary }]}>Clear Time</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export default GymScheduleSettingsModal;
