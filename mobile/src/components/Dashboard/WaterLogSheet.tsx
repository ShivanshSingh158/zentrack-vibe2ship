import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, InteractionManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { BlurView } from 'expo-blur';
import { serverTimestamp } from 'firebase/firestore';
import { COLLECTION } from '../../config/constants';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleAllNotifications } from '../../services/notifications';
import { queueWrite } from '../../services/offlineSync';
import { useGymProfile } from '../../hooks/useGymProfile';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { formatLocalDateStr } from '../../utils/dateUtils';

const WATER_GOAL_KEY = 'zentrack_water_goal_ml';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  target: number;
  onUpdateTarget: (val: number) => void;
}


export default function WaterLogSheet({ visible, onClose, userId, target, onUpdateTarget }: Props) {
  const { colors, isDark } = useTheme();
  const s = makeStyles(colors, isDark);
  const navigation = useNavigation<any>();
  const { gymProfile, saveGymProfile } = useGymProfile();
  const { weightLogs, optimisticAddWaterLog } = useWellnessData();

  const [editingTarget, setEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState(String(target));
  const [reminderFreq, setReminderFreq] = useState<string>('0');

  // Weight calculator state
  const [showWeightPrompt, setShowWeightPrompt] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  // Custom log state
  const [showCustomLog, setShowCustomLog] = useState(false);
  const [customMlInput, setCustomMlInput] = useState('');

  // User weight: check gymProfile first, then weightLogs
  const userWeight = gymProfile.weightKg || (weightLogs && weightLogs.length > 0 ? ((weightLogs[0] as any).weightKg || (weightLogs[0] as any).weight) : null);

  useEffect(() => { setTempTarget(String(target)); }, [target]);
  
  useEffect(() => {
    AsyncStorage.getItem('@zentrack_water_reminder_freq').then(val => {
      if (val) setReminderFreq(val);
    });
  }, []);

  // Smart water auto-calculation on first load if no custom target saved
  useEffect(() => {
    if (visible && userWeight && userWeight > 0) {
      AsyncStorage.getItem(WATER_GOAL_KEY).then(saved => {
        // Forced override of all old data to use the 40ml formula
        const autoGoal = Math.round(userWeight * 40); // 40ml per kg formula
        onUpdateTarget(autoGoal);
        AsyncStorage.setItem(WATER_GOAL_KEY, String(autoGoal));
      });
    }
  }, [visible, userWeight]);

  const handleFreqChange = async (freq: string) => {
    setReminderFreq(freq);
    await AsyncStorage.setItem('@zentrack_water_reminder_freq', freq);
    // Defer notification reschedule — avoids blocking the UI thread during slider interaction.
    InteractionManager.runAfterInteractions(() => {
      scheduleAllNotifications({ tasks: [], customEvents: [], gymLogs: [], attendance: [] });
    });
  };

  const handleSaveTarget = () => {
    const val = parseInt(tempTarget, 10);
    if (!isNaN(val) && val > 0) {
      onUpdateTarget(val);
      AsyncStorage.setItem(WATER_GOAL_KEY, String(val));
      if (userId) {
        queueWrite(COLLECTION.USER_PROFILES, 'update', {
          id: userId,
          waterGoalMl: val,
          waterTarget: val,
          updatedAt: Date.now(),
        }).catch(() => {});
      }
    }
    setEditingTarget(false);
  };

  const handleSaveWeightAndCalculateGoal = async () => {
    const w = parseFloat(weightInput);
    if (!isNaN(w) && w > 0) {
      // Save weight to gym profile
      await saveGymProfile({ weightKg: w });
      const autoGoal = Math.round(w * 40);
      onUpdateTarget(autoGoal);
      await AsyncStorage.setItem(WATER_GOAL_KEY, String(autoGoal));
      if (userId) {
        queueWrite(COLLECTION.USER_PROFILES, 'update', {
          id: userId,
          waterGoalMl: autoGoal,
          waterTarget: autoGoal,
          updatedAt: Date.now(),
        }).catch(() => {});
      }
      setShowWeightPrompt(false);
      setWeightInput('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleLog = async (amountMl: number) => {
    if (amountMl <= 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const todayStr = formatLocalDateStr(new Date());
    
    // Instant optimistic update (0ms latency in UI)
    optimisticAddWaterLog({
      id: `local_water_${Date.now()}`,
      userId,
      date: todayStr,
      amountMl,
      timestamp: Date.now(),
    });

    try {
      await queueWrite(COLLECTION.WATER_LOGS, 'add', {
        userId,
        date: todayStr,
        amountMl,
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
      });
      setShowCustomLog(false);
      setCustomMlInput('');
      onClose();
    } catch (e) {
      console.error('Error logging water', e);
    }
  };

  const goalLitres = (target / 1000).toFixed(1);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <BlurView intensity={isDark ? 50 : 20} tint={isDark ? "dark" : "light"} style={s.overlay}>
        <TouchableOpacity style={{ flex: 1, width: '100%' }} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
              <Ionicons name="water" size={22} color={colors.accentBlue} />
              <Text style={s.title}>Hydration Tracker</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Personalized Smart Banner */}
          <View style={s.smartBanner}>
            <Ionicons name="sparkles" size={16} color={colors.accentBlue} />
            <View style={{ flex: 1 }}>
              {userWeight ? (
                <Text style={s.smartBannerText}>
                  Goal: <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.accentBlue }}>{goalLitres}L</Text> for your <Text style={{ fontFamily: FONT_FAMILY.bold }}>{userWeight}kg</Text> body weight (40ml/kg)
                </Text>
              ) : (
                <TouchableOpacity onPress={() => setShowWeightPrompt(v => !v)}>
                  <Text style={s.smartBannerText}>
                    Goal: <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.accentBlue }}>{goalLitres}L</Text> • <Text style={{ color: colors.accentBlue, textDecorationLine: 'underline' }}>Set weight to personalize</Text>
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Weight Prompt Row */}
          {showWeightPrompt && (
            <View style={s.weightPromptRow}>
              <TextInput
                style={s.weightInput}
                placeholder="Enter weight in kg (e.g. 60)"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={weightInput}
                onChangeText={setWeightInput}
                autoFocus
              />
              <TouchableOpacity style={s.calcBtn} onPress={handleSaveWeightAndCalculateGoal}>
                <Text style={s.calcBtnText}>Calculate</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={s.subtitle}>Quick-log vessel:</Text>

          {/* 4 Quick-Log Vessel Cards */}
          <View style={s.grid}>
            {[
              { amount: 250, label: 'Glass', icon: 'water-outline', mlText: '250ml' },
              { amount: 500, label: 'Bottle', icon: 'flask-outline', mlText: '500ml' },
              { amount: 1000, label: 'Large', icon: 'pint-outline', mlText: '1L' },
              { amount: 0, label: 'Custom', icon: 'options-outline', mlText: 'Custom' }
            ].map(item => (
              <TouchableOpacity
                key={item.label}
                style={[s.card, item.label === 'Custom' && showCustomLog && { borderColor: colors.accentBlue }]}
                onPress={() => {
                  if (item.amount > 0) {
                    handleLog(item.amount);
                  } else {
                    setShowCustomLog(v => !v);
                  }
                }}
              >
                <View style={s.iconWrap}>
                  <Ionicons name={item.icon as any} size={28} color={colors.accentBlue} />
                </View>
                <Text style={s.amountText} adjustsFontSizeToFit numberOfLines={1}>{item.mlText}</Text>
                <Text style={s.labelText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom ml input row */}
          {showCustomLog && (
            <View style={s.customLogRow}>
              <TextInput
                style={s.customInput}
                placeholder="Amount in ml (e.g. 350)"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={customMlInput}
                onChangeText={setCustomMlInput}
                autoFocus
              />
              <TouchableOpacity style={s.logCustomBtn} onPress={() => handleLog(parseInt(customMlInput, 10) || 0)}>
                <Text style={s.logCustomBtnText}>Log</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Target & Reminders footer */}
          <View style={s.footer}>
            <Text style={s.footerText}>Daily Goal: </Text>
            {editingTarget ? (
              <View style={s.editRow}>
                <TextInput
                  style={[s.input, { color: colors.textPrimary }]}
                  value={tempTarget}
                  onChangeText={setTempTarget}
                  keyboardType="number-pad"
                  autoFocus
                />
                <TouchableOpacity style={s.saveBtn} onPress={handleSaveTarget}>
                  <Text style={s.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditingTarget(true)}>
                <Text style={s.targetText}>{target} ml ({goalLitres}L)  <Ionicons name="pencil" size={14} color={colors.accentBlue} /></Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.reminderSection}>
            <Text style={s.sectionTitle}>Reminders</Text>
            <View style={s.segmentRow}>
              {[
                { label: 'Off', val: '0' },
                { label: '1h', val: '1' },
                { label: '2h', val: '2' },
                { label: '3h', val: '3' }
              ].map(opt => (
                <TouchableOpacity
                  key={opt.val}
                  style={[s.segmentBtn, reminderFreq === opt.val && { backgroundColor: colors.accentBlue, borderColor: colors.accentBlue }]}
                  onPress={() => handleFreqChange(opt.val)}
                >
                  <Text style={[s.segmentText, reminderFreq === opt.val && { color: '#fff' }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={s.dashboardBtn}
            onPress={() => {
              onClose();
              navigation.navigate('MoreStack', { screen: 'WellbeingDashboard' });
            }}
          >
            <Ionicons name="bar-chart-outline" size={20} color={colors.accentPrimary} />
            <Text style={s.dashboardBtnText}>View Wellbeing Dashboard</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    padding: SPACE.xl,
    paddingBottom: SPACE.xxl * 2,
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
  closeBtn: {
    padding: SPACE.xs,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
    marginBottom: SPACE.md,
    marginTop: SPACE.sm,
  },
  smartBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    backgroundColor: colors.accentBlueDim,
    borderColor: colors.accentBlue + '30',
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    marginBottom: SPACE.xs,
  },
  smartBannerText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.xs,
    color: colors.textPrimary,
  },
  weightPromptRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
    alignItems: 'center',
    marginBottom: SPACE.xs,
    marginTop: SPACE.xs,
  },
  weightInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.accentBlue + '40',
    backgroundColor: isDark ? colors.surface : colors.surface2,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    fontSize: FONT_SIZE.sm,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.body,
  },
  calcBtn: {
    backgroundColor: colors.accentBlue,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs + 2,
    borderRadius: RADIUS.md,
  },
  calcBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: '#fff',
  },
  customLogRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
    alignItems: 'center',
    marginTop: SPACE.md,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: isDark ? colors.surface : colors.surface2,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    fontSize: FONT_SIZE.sm,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.body,
  },
  logCustomBtn: {
    backgroundColor: colors.accentBlue,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.xs + 2,
    borderRadius: RADIUS.md,
  },
  logCustomBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: '#fff',
  },
  grid: {
    flexDirection: 'row',
    gap: SPACE.xs,
    justifyContent: 'space-between',
  },
  card: {
    flex: 1,
    backgroundColor: isDark ? colors.surface : colors.surface2,
    borderRadius: RADIUS.xl,
    padding: SPACE.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentBlueDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.sm,
  },
  amountText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.base,
    color: colors.textPrimary,
  },
  labelText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  footer: {
    marginTop: SPACE.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
  },
  targetText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: colors.accentBlue,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  dashboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentDim,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACE.md,
    marginTop: SPACE.xl,
    borderWidth: 1,
    borderColor: colors.accentPrimary + '35',
  },
  dashboardBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
    marginLeft: SPACE.sm,
  },
  reminderSection: {
    marginTop: SPACE.xl,
    paddingTop: SPACE.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
    marginBottom: SPACE.md,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: SPACE.sm,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.accentBlue,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    padding: 0,
    minWidth: 60,
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: colors.accentBlue,
    paddingHorizontal: SPACE.md,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  saveBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: '#fff',
  }
});
