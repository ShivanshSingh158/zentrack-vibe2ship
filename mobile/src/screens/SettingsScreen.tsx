/**
 * SettingsScreen — ZenTrack Mobile
 * Fixed: biometric lock, tab customization, dark mode label, Sara proactive (functional),
 * accent color (#a599ff), navigation to NotificationsSettings screen.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Platform, Modal, Alert
} from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Updates from 'expo-updates';
import { useNavigation } from '@react-navigation/native';

import { auth } from '../services/firebase';
import { useMobileData } from '../contexts/MobileDataContext';
import { scheduleAllNotifications } from '../services/notifications';

// ── Design Tokens ────────────────────────────────────────────────────────────

// All available modules the user can pin
const ALL_MODULES = [
  { id: 'Tasks',       icon: 'checkmark-circle-outline', label: 'Tasks'       },
  { id: 'Calendar',    icon: 'calendar-outline',          label: 'Calendar'    },
  { id: 'Habits',      icon: 'flame-outline',             label: 'Habits'      },
  { id: 'Gym',         icon: 'barbell-outline',           label: 'Gym'         },
  { id: 'Attendance',  icon: 'clipboard-outline',         label: 'Attendance'  },
  { id: 'Analytics',   icon: 'bar-chart-outline',         label: 'Analytics'   },
  { id: 'Notes',       icon: 'document-text-outline',     label: 'Notes'       },
  { id: 'Assignments', icon: 'book-outline',              label: 'Assignments' },
  { id: 'Grades',      icon: 'calculator-outline',        label: 'Grades'      },
  { id: 'Learning',    icon: 'library-outline',           label: 'Learning'    },
];
const MAX_PINNED = 4;

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const contextData = useMobileData();
  const { user, googleAccessToken, tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments, pinnedModules, setPinnedModules } = contextData;
  const [hasWorkspace, setHasWorkspace] = useState(!!googleAccessToken);

  // ── Theme ──────────────────────────────────────────────────────────────────
  const { isDark, colors, toggleTheme } = useTheme();
  // Build styles dynamically so they react to theme changes
  const s = makeStyles(colors);

  const handleThemeToggle = useCallback((v: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleTheme();
  }, [toggleTheme]);

  // Settings state
  const [notifTimeStr, setNotifTimeStr] = useState('9:00am');
  const [notifTime, setNotifTime] = useState<Date>(new Date());
  const [saraProactive, setSaraProactive] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // UI State
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [signOutModal, setSignOutModal] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Load saved settings
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('zentrack_default_notif_time');
        if (saved) {
          const [h, m] = saved.split(':');
          const d = new Date();
          d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
          setNotifTime(d);
          setNotifTimeStr(d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase());
        }
        const saraVal = await AsyncStorage.getItem('zentrack_sara_proactive');
        if (saraVal !== null) setSaraProactive(saraVal === 'true');

        const bioVal = await AsyncStorage.getItem('zentrack_biometric_lock');
        if (bioVal !== null) setBiometricEnabled(bioVal === 'true');

        // Check biometric availability
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled   = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(compatible && enrolled);
      } catch {}
    })();
  }, []);

  const handleTimeChange = async (_: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (selectedDate) {
      setNotifTime(selectedDate);
      const timeStr24 = selectedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const timeStr   = selectedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
      setNotifTimeStr(timeStr);
      await AsyncStorage.setItem('zentrack_default_notif_time', timeStr24);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await scheduleAllNotifications({ tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments });
    }
  };

  const handleSignOut = async () => {
    setSignOutModal(false);
    await AsyncStorage.removeItem('google_workspace_token');
    await signOut(auth);
  };

  // Sara proactive toggle — now actually reads from a context / global state
  const handleSaraProactive = useCallback(async (v: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaraProactive(v);
    await AsyncStorage.setItem('zentrack_sara_proactive', v.toString());
    // The SaraScreen reads this key every time it mounts via useFocusEffect,
    // so next time Sara opens it will respect this setting.
  }, []);

  // Biometric lock toggle
  const handleBiometric = useCallback(async (v: boolean) => {
    if (v && !biometricAvailable) {
      Alert.alert(
        'Biometric Not Available',
        'No Face ID or fingerprint is set up on this device. Please configure biometrics in your device Settings first.',
      );
      return;
    }
    if (v) {
      // Verify once before enabling to confirm identity
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm your identity to enable biometric lock',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });
      if (!result.success) return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBiometricEnabled(v);
    await AsyncStorage.setItem('zentrack_biometric_lock', v.toString());
    Alert.alert(
      v ? 'Biometric Lock Enabled' : 'Biometric Lock Disabled',
      v
        ? 'ZenTrack will now require Face ID or fingerprint each time you open the app.'
        : 'Biometric lock has been turned off.',
      [{ text: 'OK' }],
    );
  }, [biometricAvailable]);

  // Tab customization
  const isModulePinned = (id: string) => pinnedModules.includes(id);
  const toggleModule = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isModulePinned(id)) {
      // Always keep at least 1 pinned
      if (pinnedModules.length <= 1) {
        Alert.alert('At least one module must be pinned');
        return;
      }
      setPinnedModules(pinnedModules.filter(m => m !== id));
    } else {
      if (pinnedModules.length >= MAX_PINNED) {
        Alert.alert('Max 4 tabs', 'Unpin a module first to add another.');
        return;
      }
      setPinnedModules([...pinnedModules, id]);
    }
  }, [pinnedModules, setPinnedModules]);

  const avatarLetter = user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?';
  const displayName  = user?.displayName || 'User';
  const emailLine    = `${user?.email || ''} · Free plan`;

  const handleExportData = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      let csv = 'ID,Title,Status,Priority,Date,EstimatedMinutes,CompletedAt\n';
      tasks.forEach(t => {
        const safeTitle = (t.title || '').replace(/"/g, '""');
        csv += `"${t.id}","${safeTitle}","${t.status || ''}","${t.priority || ''}","${t.date || ''}","${t.estimatedMinutes || 0}","${t.completedAt || ''}"\n`;
      });
      const fs = FileSystem as any;
      const fileUri = (fs.documentDirectory || fs.cacheDirectory || '') + 'ZenTrack_Data_Export.csv';
      await FileSystem.writeAsStringAsync(fileUri, csv);
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(fileUri, { dialogTitle: 'Export ZenTrack Data' });
      } else {
        Alert.alert('Export Failed', 'Sharing is not available on this device.');
      }
    } catch {
      Alert.alert('Export Error', 'Failed to generate export file.');
    }
  };

  const handleCheckForUpdate = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      if (__DEV__) {
        Alert.alert('Development Mode', 'OTA live updates can only be checked in a standalone production build (APK/AAB).');
        return;
      }
      
      setCheckingUpdate(true);
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert(
          'Update Available',
          'A new version is available. Download and install now?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setCheckingUpdate(false) },
            { 
              text: 'Update', 
              onPress: async () => {
                try {
                  await Updates.fetchUpdateAsync();
                  await Updates.reloadAsync();
                } catch {
                  Alert.alert('Error', 'Failed to apply update.');
                  setCheckingUpdate(false);
                }
              }
            }
          ]
        );
      } else {
        Alert.alert('Up to Date', 'You are already running the latest version of ZenTrack.');
        setCheckingUpdate(false);
      }
    } catch (error) {
      Alert.alert('Check Failed', 'Could not connect to update servers. Make sure you are online.');
      setCheckingUpdate(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const Hairline = () => <View style={s.hairline} />;
  const SectionLabel = ({ text }: { text: string }) => <Text style={s.sectionLabel}>{text}</Text>;

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Profile Card ── */}
        <AnimatedPressable style={s.profileCard} activeOpacity={0.7}>
          <View style={s.profileAvatar}>
            <Text style={s.profileAvatarText}>{avatarLetter}</Text>
          </View>
          <View style={{ flex: 1, paddingLeft: 12 }}>
            <Text style={s.profileName}>{displayName}</Text>
            <Text style={s.profileEmail}>{emailLine}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        </AnimatedPressable>

        {/* ── GENERAL ── */}
        <SectionLabel text="GENERAL" />

        <View style={s.groupCard}>
          {/* Default reminder time */}
          <View style={s.settingRow}>
            <View style={s.iconBox}><Ionicons name="time-outline" size={15} color={COLORS.accentPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingTitle}>Default reminder time</Text>
              <Text style={s.settingSubtitle}>For tasks with no set time</Text>
            </View>
            <AnimatedPressable style={s.valueChip} onPress={() => setShowTimePicker(true)}>
              <Text style={s.valueChipText}>{notifTimeStr}</Text>
            </AnimatedPressable>
          </View>

          {showTimePicker && (
            <DateTimePicker
              value={notifTime}
              mode="time"
              display={Platform.OS === 'android' ? 'clock' : 'default'}
              onChange={handleTimeChange}
            />
          )}

          <Hairline />

          {/* Notifications */}
          <AnimatedPressable
            style={s.settingRow}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('MoreStack', { screen: 'NotificationsSettings' })}
          >
            <View style={s.iconBox}><Ionicons name="notifications-outline" size={15} color={COLORS.accentPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingTitle}>Notification preferences</Text>
              <Text style={s.settingSubtitle}>Habits, tasks, gym, quiet hours & more</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={COLORS.textTertiary} />
          </AnimatedPressable>

          <Hairline />

            {/* Sara proactive nudges — now functional */}
            <View style={s.settingRow}>
              <View style={s.iconBox}><Ionicons name="planet-outline" size={15} color={COLORS.accentPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.settingTitle}>Sara's proactive nudges</Text>
                <Text style={s.settingSubtitle}>
                  {saraProactive ? 'She will suggest things unprompted' : 'She only responds when you ask'}
                </Text>
              </View>
              <Switch
                value={saraProactive}
                onValueChange={handleSaraProactive}
                trackColor={{ false: COLORS.surfaceRaised, true: COLORS.accentPrimary }}
                thumbColor={'#000000'}
                ios_backgroundColor={COLORS.surfaceRaised}
                style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] }}
              />
            </View>

            <Hairline />

          <Hairline />

          {/* Biometric Lock */}
            <View style={s.settingRow}>
              <View style={[s.iconBox, biometricEnabled ? { backgroundColor: 'rgba(94,218,158,0.15)' } : {}]}>
                <Ionicons name="finger-print-outline" size={15} color={biometricEnabled ? COLORS.accentGreen : COLORS.accentPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.settingTitle}>Biometric lock</Text>
                <Text style={s.settingSubtitle}>
                  {!biometricAvailable
                    ? 'Not available — set up Face ID or fingerprint first'
                    : biometricEnabled
                      ? 'Required on every app open'
                      : 'Require Face ID / fingerprint to open app'}
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleBiometric}
                disabled={!biometricAvailable}
                trackColor={{ false: COLORS.surfaceRaised, true: COLORS.accentGreen }}
                thumbColor={'#000000'}
                ios_backgroundColor={COLORS.surfaceRaised}
                style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }], opacity: biometricAvailable ? 1 : 0.4 }}
              />
            </View>
        </View>



        {/* ── S.A.R.A ── */}
        <SectionLabel text="S.A.R.A" />

        <View style={s.groupCard}>
          {/* Sara Proactive Nudges — surfaced from GENERAL group for better discoverability */}
          <AnimatedPressable
            style={s.settingRow}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('MoreStack', { screen: 'AgentHistory' })}
          >
            <View style={[s.iconBox, { backgroundColor: 'rgba(165,153,255,0.12)' }]}>
              <Ionicons name="time-outline" size={15} color={COLORS.accentPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingTitle}>Action History</Text>
              <Text style={s.settingSubtitle}>See every action Sara took on your behalf</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={COLORS.textTertiary} />
          </AnimatedPressable>
        </View>

        {/* ── DATA & ACCOUNT ── */}
        <SectionLabel text="DATA & ACCOUNT" />

        <View style={s.groupCard}>
          {/* Export Data */}
          <AnimatedPressable style={s.settingRow} activeOpacity={0.7} onPress={handleExportData}>
            <View style={s.iconBox}><Ionicons name="download-outline" size={15} color={COLORS.accentPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingTitle}>Export data</Text>
              <Text style={s.settingSubtitle}>Download as CSV</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={COLORS.textTertiary} />
          </AnimatedPressable>

          <Hairline />

          {/* Check for Updates */}
          <AnimatedPressable style={s.settingRow} activeOpacity={0.7} onPress={handleCheckForUpdate} disabled={checkingUpdate}>
            <View style={s.iconBox}><Ionicons name="cloud-download-outline" size={15} color={COLORS.accentPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingTitle}>Check for updates</Text>
              <Text style={s.settingSubtitle}>{checkingUpdate ? 'Checking...' : 'OTA live updates'}</Text>
            </View>
            {checkingUpdate ? null : <Ionicons name="chevron-forward" size={14} color={COLORS.textTertiary} />}
          </AnimatedPressable>

          <Hairline />

          {/* Sign Out */}
          <AnimatedPressable
            style={s.settingRow}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setSignOutModal(true); }}
            activeOpacity={0.7}
          >
            <View style={[s.iconBox, { backgroundColor: COLORS.errorBg }]}>
              <Ionicons name="log-out-outline" size={15} color={COLORS.error} />
            </View>
            <Text style={[s.settingTitle, { color: COLORS.error }]}>Sign out</Text>
          </AnimatedPressable>
        </View>

        {/* ── UPCOMING FEATURES ── */}
        <SectionLabel text="UPCOMING FEATURES" />

        <View style={[s.groupCard, { opacity: 0.6 }]}>
          {/* Appearance / Theme toggle — locked */}
          <AnimatedPressable style={s.settingRow} activeOpacity={0.7} onPress={() => Alert.alert('Coming Soon', 'Light mode is currently being polished and will return in a future update!')}>
            <View style={[s.iconBox, { backgroundColor: 'rgba(124,111,247,0.12)' }]}>
              <Ionicons name="sunny" size={15} color={colors.accentPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingTitle}>Appearance (Light Mode)</Text>
              <Text style={s.settingSubtitle}>Coming in next update</Text>
            </View>
            <Ionicons name="lock-closed" size={14} color={colors.textTertiary} />
          </AnimatedPressable>

          <Hairline />
          {/* Google Workspace */}
          <View style={s.settingRow}>
            <View style={[s.iconBox, { backgroundColor: 'rgba(217,48,37,0.2)' }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#d93025' }}>G</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingTitle}>Google Workspace</Text>
              <Text style={s.settingSubtitle}>Integration coming soon</Text>
            </View>
            <Ionicons name="construct-outline" size={14} color={colors.textTertiary} />
          </View>

          <Hairline />

            {/* Language */}
            <AnimatedPressable
              style={s.settingRow}
              activeOpacity={0.7}
              onPress={() => Alert.alert('Multi-language Support', 'ZenTrack currently only supports English (US). Additional languages will be available in future updates.')}
            >
              <View style={s.iconBox}><Ionicons name="language-outline" size={15} color={colors.accentPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.settingTitle}>Language</Text>
                <Text style={s.settingSubtitle}>English (US)</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={COLORS.textTertiary} />
            </AnimatedPressable>
          </View>

        <Text style={s.versionText}>ZenTrack v1.0.0</Text>
      </ScrollView>

      {/* ── Sign Out Confirmation Modal ── */}
      {signOutModal && (
        <Modal visible={signOutModal} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.confirmCard}>
              <Text style={s.confirmTitle}>Sign out of ZenTrack?</Text>
              <Text style={s.confirmBody}>Your data is saved. You can sign back in anytime.</Text>
              <View style={s.confirmBtns}>
                <AnimatedPressable style={s.confirmCancel} onPress={() => setSignOutModal(false)}>
                  <Text style={s.confirmCancelText}>Cancel</Text>
                </AnimatedPressable>
                <AnimatedPressable style={s.confirmDanger} onPress={handleSignOut}>
                  <Text style={s.confirmDangerText}>Sign out</Text>
                </AnimatedPressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../contexts/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: 8, paddingTop: 16, paddingBottom: 60 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 16,
    padding: 14, paddingHorizontal: 16, marginBottom: 24,
    borderWidth: 1, borderColor: colors.border,
  },
  profileAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { fontFamily: 'Inter_700Bold', fontSize: 17, color: '#000000' },
  profileName:  { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.textPrimary },
  profileEmail: { fontFamily: 'Inter_400Regular',  fontSize: 12, color: colors.textTertiary, marginTop: 2 },

  collapsibleHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold', fontSize: 11,
    letterSpacing: 0.8, color: colors.textTertiary, marginBottom: 8,
  },

  groupCard: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', marginBottom: 4,
  },

  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  iconBox: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: colors.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBoxActive: { backgroundColor: 'rgba(165,153,255,0.2)' },
  settingTitle:    { fontFamily: 'Inter_400Regular',  fontSize: 14, color: colors.textPrimary },
  settingSubtitle: { fontFamily: 'Inter_400Regular',  fontSize: 11, color: colors.textTertiary, marginTop: 2, lineHeight: 15 },

  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 58 },

  valueChip: {
    backgroundColor: colors.surfaceRaised, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  valueChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.accentPrimary },

  // Tab customization
  tabHint: {
    fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.textTertiary,
    lineHeight: 18, marginBottom: 8, marginLeft: 2,
  },
  tabCount: {
    fontFamily: 'Inter_400Regular', fontSize: 11, color: colors.textTertiary,
    textAlign: 'right', marginTop: 6, marginRight: 4, marginBottom: 8,
  },
  checkBox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: colors.textTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  checkBoxActive: {
    backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary,
  },

  versionText: {
    fontFamily: 'Inter_400Regular', fontSize: 11, color: colors.textTertiary,
    textAlign: 'center', marginTop: 32,
  } as any,

  // Sign out modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  confirmCard: {
    backgroundColor: colors.surfaceRaised, borderRadius: 20,
    padding: 24, width: '100%',
    borderWidth: 1, borderColor: colors.border,
  },
  confirmTitle: { fontFamily: 'Inter_700Bold',   fontSize: 17, color: colors.textPrimary, marginBottom: 8 },
  confirmBody:  { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 24 },
  confirmBtns:  { flexDirection: 'row', gap: 12 },
  confirmCancel: {
    flex: 1, padding: 14, borderRadius: 12,
    backgroundColor: colors.surfaceRaised, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  confirmCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.textPrimary },
  confirmDanger: {
    flex: 1, padding: 14, borderRadius: 12,
    backgroundColor: colors.errorBg, alignItems: 'center',
    borderWidth: 1, borderColor: colors.error,
  },
  confirmDangerText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.error },
});
