/**
 * ClassNotifSettingsModal — ZenTrack Mobile
 *
 * Per-subject class notification preferences accessible from the Attendance screen.
 * High-aesthetic Obsidian Cosmos redesign featuring structured sub-cards,
 * single-line auto-fitting delay chips (guaranteed zero line-breaks on "Immediately"),
 * symmetrically aligned 2x2 grid for early warnings, and zero-gap bottom flush layout
 * completely covering the background navigation tab bar.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import Reanimated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  Easing,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT_FAMILY } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { useAcademicData } from '../../contexts/domains/AcademicContext';
import { usePlannerData } from '../../contexts/domains/PlannerContext';
import type { AttendanceSubject } from '../../contexts/MobileDataContext';
import {
  scheduleAllNotifications,
  clearScheduleCache,
} from '../../services/notifications';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubjectPref {
  enabled: boolean;
  /** Which pre-class minute offsets to fire (negative = before class). Default: [-90, -60, -30] */
  preOffsets: number[];
  /** Minutes after class END to send log reminder. 0 = immediately */
  logDelay: number;
  /** Send 3× early warnings for the first class/lab of the day */
  firstPreEnabled: boolean;
  /** Send mid-lab (60 min) notification for labs */
  labMidEnabled: boolean;
  /** Minutes after lab END to send log reminder. 0 = immediately */
  labEndDelay: number;
}

const DEFAULT_PREF: SubjectPref = {
  enabled: true,
  preOffsets: [-90, -60, -30],
  logDelay: 0,
  firstPreEnabled: true,
  labMidEnabled: true,
  labEndDelay: 0,
};

const PRE_OFFSET_OPTIONS: { label: string; value: number }[] = [
  { label: '90 min', value: -90 },
  { label: '60 min', value: -60 },
  { label: '30 min', value: -30 },
  { label: '15 min', value: -15 },
];

const LOG_DELAY_OPTIONS: { label: string; value: number }[] = [
  { label: 'Immediately', value: 0 },
  { label: '+5 min',      value: 5 },
  { label: '+10 min',     value: 10 },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const ClassNotifSettingsModal = React.memo(function ClassNotifSettingsModal({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, isDark, insets), [colors, isDark, insets]);
  const { tasks, habitLogs, allHabits } = useCoreData();
  const { gymLogs, waterLogs, sleepLogs } = useWellnessData();
  const { attendance, assignments } = useAcademicData();
  const { customEvents } = usePlannerData();
  const subjects: AttendanceSubject[] = attendance ?? [];

  const [prefs, setPrefs]     = useState<Record<string, SubjectPref>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  // ── Load prefs from AsyncStorage when modal opens ─────────────────────────
  useEffect(() => {
    if (!visible) return;
    if (subjects.length === 0) { setLoading(false); return; }

    const keys = subjects.flatMap(s => [
      `@class_notif_enabled_${s.id}`,
      `@class_notif_pre_offsets_${s.id}`,
      `@class_notif_log_delay_${s.id}`,
      `@class_notif_first_pre_${s.id}`,
      `@class_notif_lab_mid_${s.id}`,
      `@class_notif_lab_end_delay_${s.id}`,
    ]);

    AsyncStorage.multiGet(keys).then(pairs => {
      const kv: Record<string, string | null> = {};
      pairs.forEach(([k, v]) => { kv[k] = v; });

      const loaded: Record<string, SubjectPref> = {};
      subjects.forEach(s => {
        const preRaw = kv[`@class_notif_pre_offsets_${s.id}`];
        let preOffsets = DEFAULT_PREF.preOffsets;
        if (preRaw) { try { const p = JSON.parse(preRaw); if (Array.isArray(p)) preOffsets = p; } catch {} }

        loaded[s.id!] = {
          enabled:        kv[`@class_notif_enabled_${s.id}`] === null ? true : kv[`@class_notif_enabled_${s.id}`] === 'true',
          preOffsets,
          logDelay:       parseInt(kv[`@class_notif_log_delay_${s.id}`] || '0', 10),
          firstPreEnabled: kv[`@class_notif_first_pre_${s.id}`] !== 'false',
          labMidEnabled:  kv[`@class_notif_lab_mid_${s.id}`] !== 'false',
          labEndDelay:    parseInt(kv[`@class_notif_lab_end_delay_${s.id}`] || '0', 10),
        };
      });
      setPrefs(loaded);
      setLoading(false);
    });
  }, [visible, subjects]);

  const update = useCallback((id: string, patch: Partial<SubjectPref>) => {
    Haptics.selectionAsync();
    setPrefs(prev => ({ ...prev, [id]: { ...(prev[id] ?? DEFAULT_PREF), ...patch } }));
  }, []);

  const togglePreOffset = useCallback((id: string, value: number) => {
    Haptics.selectionAsync();
    setPrefs(prev => {
      const current = prev[id] ?? DEFAULT_PREF;
      const offsets = current.preOffsets.includes(value)
        ? current.preOffsets.filter(v => v !== value)
        : [...current.preOffsets, value];
      return { ...prev, [id]: { ...current, preOffsets: offsets } };
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const pairs: [string, string][] = [];
      Object.entries(prefs).forEach(([id, pref]) => {
        pairs.push([`@class_notif_enabled_${id}`,      String(pref.enabled)]);
        pairs.push([`@class_notif_pre_offsets_${id}`,  JSON.stringify(pref.preOffsets)]);
        pairs.push([`@class_notif_log_delay_${id}`,    String(pref.logDelay)]);
        pairs.push([`@class_notif_first_pre_${id}`,    String(pref.firstPreEnabled)]);
        pairs.push([`@class_notif_lab_mid_${id}`,      String(pref.labMidEnabled)]);
        pairs.push([`@class_notif_lab_end_delay_${id}`, String(pref.labEndDelay)]);
      });
      await AsyncStorage.multiSet(pairs);

      clearScheduleCache();
      await scheduleAllNotifications({
        tasks:        tasks        ?? [],
        customEvents: customEvents ?? [],
        gymLogs:      gymLogs      ?? [],
        attendance:   subjects     ?? [],
        habitLogs:    habitLogs    ?? [],
        allHabits:    allHabits    ?? [],
        assignments:  assignments  ?? [],
        waterLogs:    waterLogs    ?? [],
        sleepLogs:    sleepLogs    ?? [],
      });
    } catch (e) {
      console.warn('[ClassNotifModal] Save failed:', e);
    } finally {
      setSaving(false);
      handleRequestClose();
    }
  }, [prefs, subjects, tasks, customEvents, gymLogs, habitLogs, allHabits, assignments, waterLogs, sleepLogs, onClose]);

  const [modalVisible, setModalVisible] = useState(visible);
  const [contentVisible, setContentVisible] = useState(visible);
  const isClosingRef = React.useRef(false);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setModalVisible(true);
      setContentVisible(true);
    } else if (modalVisible && !isClosingRef.current) {
      isClosingRef.current = true;
      setContentVisible(false);
      const timer = setTimeout(() => {
        setModalVisible(false);
        isClosingRef.current = false;
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [visible, modalVisible]);

  const handleRequestClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setContentVisible(false);
    setTimeout(() => {
      setModalVisible(false);
      onClose();
      isClosingRef.current = false;
    }, 220);
  }, [onClose]);

  // ── Check if a subject has lab sessions ───────────────────────────────────
  const subjectHasLabs = (subj: AttendanceSubject) =>
    Object.values(subj.schedule ?? {}).some((sch: any) =>
      (sch?.labs?.length > 0) || (sch?.labCount > 0)
    );

  if (!modalVisible && !visible) return null;

  return (
    <Modal visible={modalVisible} animationType="none" transparent onRequestClose={handleRequestClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {contentVisible && (
          <Reanimated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={[StyleSheet.absoluteFill, styles.modalBg]}
          >
            {Platform.OS === 'ios' && (
              <BlurView intensity={25} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            )}
            <Pressable style={StyleSheet.absoluteFill} onPress={handleRequestClose} />
          </Reanimated.View>
        )}

        {contentVisible && (
          <Reanimated.View
            entering={SlideInDown.duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}
            exiting={SlideOutDown.duration(200).easing(Easing.in(Easing.quad))}
            style={styles.sheetContainer}
          >
          {/* iOS Sheet Grab Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.sheetHandle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Class Alerts</Text>
              <Text style={styles.headerSub}>Customise when each subject notifies you</Text>
            </View>
            <TouchableOpacity
              onPress={handleRequestClose}
              style={styles.closeBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Info banner */}
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={16} color={colors.accentPrimary} style={{ marginTop: 1 }} />
            <Text style={styles.infoText}>
              Tap <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>Present</Text> or <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>Absent</Text> directly from notifications — no need to open the app.
            </Text>
          </View>

          {loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator color={colors.accentPrimary} size="large" />
            </View>
          ) : subjects.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
              <Ionicons name="school-outline" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: 'center', fontFamily: FONT_FAMILY.medium }}>
                Add subjects first via the Timetable.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {subjects.map(subj => {
                const pref = prefs[subj.id!] ?? DEFAULT_PREF;
                const hasLabs = subjectHasLabs(subj);
                const disabled = !pref.enabled;

                // Days that have classes/labs
                const classDays = Object.entries(subj.schedule ?? {})
                  .filter(([, sch]: any) =>
                    (sch?.classes?.length > 0) || (sch?.labs?.length > 0) ||
                    sch?.classCount > 0 || sch?.labCount > 0
                  )
                  .map(([idx]) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parseInt(idx)])
                  .join(', ');

                return (
                  <View key={subj.id} style={[styles.card, disabled && { opacity: 0.65 }]}>
                    {/* ── Subject Header Row: Name + Days + Master Toggle ── */}
                    <View style={styles.subjectRow}>
                      <View style={styles.subjectTitleBlock}>
                        <Text style={styles.subjectName} numberOfLines={1}>{subj.name}</Text>
                        <Text style={styles.subjectDays}>{classDays || 'No schedule set'}</Text>
                      </View>
                      <Switch
                        value={pref.enabled}
                        onValueChange={val => update(subj.id!, { enabled: val })}
                        trackColor={{ false: isDark ? '#2C2C30' : '#E5E5EA', true: colors.accentPrimary }}
                        thumbColor="#FFFFFF"
                      />
                    </View>

                    {/* ── Section 1: First Class/Lab of the Day (2x2 Segmented Grid) ── */}
                    <View style={styles.sectionCard}>
                      <View style={styles.sectionHeaderRow}>
                        <View style={styles.sectionTitleGroup}>
                          <Ionicons name="alarm-outline" size={14} color={colors.accentPrimary} />
                          <Text style={styles.sectionEyebrow}>FIRST CLASS / LAB OF THE DAY</Text>
                        </View>
                        <Switch
                          value={pref.firstPreEnabled}
                          onValueChange={val => update(subj.id!, { firstPreEnabled: val })}
                          trackColor={{ false: isDark ? '#2C2C30' : '#E5E5EA', true: colors.accentPrimary }}
                          thumbColor="#FFFFFF"
                          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                          disabled={disabled}
                        />
                      </View>

                      {pref.firstPreEnabled && !disabled && (
                        <View style={styles.sectionBody}>
                          <Text style={styles.sectionInstruction}>Alert me before it starts:</Text>
                          {/* Symmetrically aligned 2x2 Grid with equal heights */}
                          <View style={styles.gridContainer}>
                            <View style={styles.gridRow}>
                              {PRE_OFFSET_OPTIONS.slice(0, 2).map(opt => {
                                const active = pref.preOffsets.includes(opt.value);
                                return (
                                  <TouchableOpacity
                                    key={opt.value}
                                    onPress={() => togglePreOffset(subj.id!, opt.value)}
                                    style={[styles.offsetBtn, active && styles.offsetBtnActive]}
                                    activeOpacity={0.7}
                                  >
                                    <Text
                                      style={[styles.offsetBtnText, active && styles.offsetBtnTextActive]}
                                      numberOfLines={1}
                                      adjustsFontSizeToFit
                                      minimumFontScale={0.85}
                                    >
                                      {opt.label} before
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            <View style={styles.gridRow}>
                              {PRE_OFFSET_OPTIONS.slice(2, 4).map(opt => {
                                const active = pref.preOffsets.includes(opt.value);
                                return (
                                  <TouchableOpacity
                                    key={opt.value}
                                    onPress={() => togglePreOffset(subj.id!, opt.value)}
                                    style={[styles.offsetBtn, active && styles.offsetBtnActive]}
                                    activeOpacity={0.7}
                                  >
                                    <Text
                                      style={[styles.offsetBtnText, active && styles.offsetBtnTextActive]}
                                      numberOfLines={1}
                                      adjustsFontSizeToFit
                                      minimumFontScale={0.85}
                                    >
                                      {opt.label} before
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        </View>
                      )}
                    </View>

                    {/* ── Section 2: Post-Class Attendance Reminder (3-Column Segmented Bar, Single-Line Immediately) ── */}
                    <View style={styles.sectionCard}>
                      <View style={styles.sectionHeaderRow}>
                        <View style={styles.sectionTitleGroup}>
                          <Ionicons name="checkmark-circle-outline" size={14} color={isDark ? '#38BDF8' : '#0284C7'} />
                          <Text style={styles.sectionEyebrow}>AFTER CLASS ENDS</Text>
                        </View>
                      </View>

                      <View style={styles.sectionBody}>
                        <Text style={styles.sectionInstruction}>Send attendance log reminder:</Text>
                        <View style={styles.delayRow}>
                          {LOG_DELAY_OPTIONS.map(opt => {
                            const active = pref.logDelay === opt.value;
                            const isImmediately = opt.value === 0;
                            return (
                              <TouchableOpacity
                                key={opt.value}
                                disabled={disabled}
                                onPress={() => update(subj.id!, { logDelay: opt.value })}
                                style={[
                                  styles.delayBtn,
                                  isImmediately ? styles.delayBtnWide : styles.delayBtnNormal,
                                  active && styles.delayBtnActive,
                                ]}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={[styles.delayBtnText, active && styles.delayBtnTextActive]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.85}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>

                    {/* ── Section 3: Lab Sessions (Only if subject has labs) ── */}
                    {hasLabs && (
                      <View style={[styles.sectionCard, styles.labSectionCard]}>
                        <View style={styles.sectionHeaderRow}>
                          <View style={styles.sectionTitleGroup}>
                            <Ionicons name="flask-outline" size={14} color={isDark ? '#F59E0B' : '#D97706'} />
                            <Text style={[styles.sectionEyebrow, { color: isDark ? '#F59E0B' : '#D97706' }]}>
                              LAB SESSIONS (2 HOURS)
                            </Text>
                          </View>
                        </View>

                        <View style={styles.sectionBody}>
                          {/* Mid-lab reminder toggle */}
                          <View style={styles.toggleRow}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={styles.toggleTitle}>Notify at 1-hour mark (mid-lab)</Text>
                            </View>
                            <Switch
                              value={pref.labMidEnabled}
                              onValueChange={val => update(subj.id!, { labMidEnabled: val })}
                              trackColor={{ false: isDark ? '#2C2C30' : '#E5E5EA', true: isDark ? '#F59E0B' : '#D97706' }}
                              thumbColor="#FFFFFF"
                              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                              disabled={disabled}
                            />
                          </View>

                          <View style={styles.innerDivider} />

                          {/* Post-lab log reminder (Single-Line Immediately) */}
                          <Text style={styles.sectionInstruction}>After lab ends, log reminder:</Text>
                          <View style={styles.delayRow}>
                            {LOG_DELAY_OPTIONS.map(opt => {
                              const active = pref.labEndDelay === opt.value;
                              const isImmediately = opt.value === 0;
                              return (
                                <TouchableOpacity
                                  key={opt.value}
                                  disabled={disabled}
                                  onPress={() => update(subj.id!, { labEndDelay: opt.value })}
                                  style={[
                                    styles.delayBtn,
                                    isImmediately ? styles.delayBtnWide : styles.delayBtnNormal,
                                    active && {
                                      backgroundColor: isDark ? '#F59E0B' : '#D97706',
                                      borderColor: isDark ? '#F59E0B' : '#D97706',
                                    },
                                  ]}
                                  activeOpacity={0.7}
                                >
                                  <Text
                                    style={[
                                      styles.delayBtnText,
                                      active && { color: isDark ? '#000000' : '#FFFFFF', fontFamily: FONT_FAMILY.bold },
                                    ]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.85}
                                  >
                                    {opt.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Save footer flush to bottom edge */}
          {!loading && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color={isDark ? "#000000" : "#FFFFFF"} size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save &amp; Apply Notifications</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </Reanimated.View>
        )}
      </View>
    </Modal>
  );
});

export default ClassNotifSettingsModal;

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (colors: any, isDark: boolean = true, insets: any = { bottom: 0, top: 0 }) => StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    flex: 1,
    marginTop: Math.max((insets.top || 0) + 20, 54),
    backgroundColor: isDark ? '#101012' : '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  sheetHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.18)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.08)' : 'rgba(108, 92, 231, 0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165, 153, 255, 0.18)' : 'rgba(108, 92, 231, 0.14)',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: isDark ? 'rgba(255, 255, 255, 0.72)' : colors.textSecondary,
    lineHeight: 17,
    fontFamily: FONT_FAMILY.medium,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 14,
  },
  card: {
    backgroundColor: isDark ? '#161619' : '#F9F9FB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    padding: 16,
    gap: 12,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subjectTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    paddingRight: 12,
  },
  subjectName: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  subjectDays: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
    color: colors.textMuted,
  },
  sectionCard: {
    backgroundColor: isDark ? '#1C1C20' : '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
    gap: 10,
  },
  labSectionCard: {
    borderColor: isDark ? 'rgba(245, 158, 11, 0.20)' : 'rgba(217, 119, 6, 0.15)',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionEyebrow: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  sectionBody: {
    gap: 8,
  },
  sectionInstruction: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
    color: colors.textSecondary,
  },
  gridContainer: {
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offsetBtn: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: isDark ? '#141417' : '#F0EFF4',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
  },
  offsetBtnActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  offsetBtnText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  offsetBtnTextActive: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
  },
  delayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  delayBtn: {
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: isDark ? '#141417' : '#F0EFF4',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
  },
  delayBtnWide: {
    flex: 1.35,
  },
  delayBtnNormal: {
    flex: 1,
  },
  delayBtnActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  delayBtnText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  delayBtnTextActive: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleTitle: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.medium,
    color: colors.textPrimary,
  },
  innerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    marginVertical: 2,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Math.max(insets.bottom || 0, 16),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    backgroundColor: isDark ? '#101012' : '#FFFFFF',
  },
  saveBtn: {
    backgroundColor: colors.accentPrimary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: isDark ? '#000000' : '#FFFFFF',
  },
});
