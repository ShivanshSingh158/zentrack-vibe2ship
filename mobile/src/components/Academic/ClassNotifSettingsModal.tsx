/**
 * ClassNotifSettingsModal — ZenTrack Mobile
 *
 * Per-subject class notification preferences accessible from the Attendance screen.
 * Each subject can independently configure:
 *
 *  1. Master enable/disable toggle
 *  2. 3× early warnings for first class/lab of the day (−90, −60, −30 min by default)
 *     — customisable which offset chips are active
 *  3. Post-class log reminder delay (immediately / +5 min / +10 min after class ends)
 *  4. Mid-lab notification (at the 60-min mark during a 2-hour lab)
 *  5. Post-lab log reminder delay
 *
 * On close, calls clearScheduleCache() + scheduleAllNotifications() to apply immediately.
 *
 * AsyncStorage keys per subject {id}:
 *   @class_notif_enabled_{id}         'true'/'false'
 *   @class_notif_pre_offsets_{id}     JSON array e.g. "[-90,-60,-30]" (negative = before)
 *   @class_notif_log_delay_{id}       minutes after class end, default 0
 *   @class_notif_first_pre_{id}       'true'/'false' — send early warnings for first session
 *   @class_notif_lab_mid_{id}         'true'/'false' — mid-lab (60 min) reminder
 *   @class_notif_lab_end_delay_{id}   minutes after lab end, default 0
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Switch, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useMobileData, AttendanceSubject } from '../../contexts/MobileDataContext';
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

export default function ClassNotifSettingsModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const mobileData = useMobileData() as any;
  const subjects: AttendanceSubject[] = mobileData.attendance ?? [];
  const { tasks, customEvents, gymLogs, habitLogs, allHabits, assignments, waterLogs, sleepLogs } = mobileData;

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
    setPrefs(prev => ({ ...prev, [id]: { ...(prev[id] ?? DEFAULT_PREF), ...patch } }));
  }, []);

  const togglePreOffset = useCallback((id: string, value: number) => {
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
      onClose();
    }
  }, [prefs, subjects, tasks, customEvents, gymLogs, habitLogs, allHabits, assignments, waterLogs, sleepLogs, onClose]);

  // ── Check if a subject has lab sessions ───────────────────────────────────
  const subjectHasLabs = (subj: AttendanceSubject) =>
    Object.values(subj.schedule ?? {}).some((sch: any) =>
      (sch?.labs?.length > 0) || (sch?.labCount > 0)
    );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Class Alerts</Text>
            <Text style={styles.headerSub}>Customise when each subject notifies you</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={14} color={colors.accentPrimary} />
          <Text style={styles.infoText}>
            Tap <Text style={{ fontWeight: 'bold' }}>Present</Text> or <Text style={{ fontWeight: 'bold' }}>Absent</Text> directly from the notification — no need to open the app.
          </Text>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={colors.accentPrimary} />
          </View>
        ) : subjects.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
            <Ionicons name="school-outline" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: 'center' }}>
              Add subjects first via the Timetable.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: SPACE.md, gap: SPACE.md }}>
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
                <View key={subj.id} style={[styles.card, disabled && { opacity: 0.6 }]}>
                  {/* ── Header row: subject name + master toggle ── */}
                  <View style={styles.subjectRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subjectName}>{subj.name}</Text>
                      <Text style={styles.subjectDays}>{classDays || 'No schedule set'}</Text>
                    </View>
                    <Switch
                      value={pref.enabled}
                      onValueChange={val => update(subj.id!, { enabled: val })}
                      trackColor={{ false: colors.border, true: colors.accentPrimary }}
                      thumbColor={Platform.OS === 'android' ? (pref.enabled ? '#fff' : '#aaa') : '#fff'}
                    />
                  </View>

                  {/* ── Section 1: First-session early warnings ── */}
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="alarm-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.sectionTitle}>FIRST CLASS/LAB OF THE DAY</Text>
                      <Switch
                        value={pref.firstPreEnabled}
                        onValueChange={val => update(subj.id!, { firstPreEnabled: val })}
                        trackColor={{ false: colors.border, true: colors.accentPrimary }}
                        thumbColor={Platform.OS === 'android' ? (pref.firstPreEnabled ? '#fff' : '#aaa') : '#fff'}
                        style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                        disabled={disabled}
                      />
                    </View>
                    {pref.firstPreEnabled && !disabled && (
                      <>
                        <Text style={styles.sectionSubtitle}>Alert me before it starts:</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                          {PRE_OFFSET_OPTIONS.map(opt => {
                            const active = pref.preOffsets.includes(opt.value);
                            return (
                              <TouchableOpacity
                                key={opt.value}
                                onPress={() => togglePreOffset(subj.id!, opt.value)}
                                style={[styles.chip, active && styles.chipActive]}
                              >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                  {opt.label} before
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </>
                    )}
                  </View>

                  {/* ── Section 2: Post-class log reminder ── */}
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="checkmark-circle-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.sectionTitle}>AFTER CLASS ENDS</Text>
                    </View>
                    <Text style={styles.sectionSubtitle}>Send attendance log reminder:</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                      {LOG_DELAY_OPTIONS.map(opt => {
                        const active = pref.logDelay === opt.value;
                        return (
                          <TouchableOpacity
                            key={opt.value}
                            disabled={disabled}
                            onPress={() => update(subj.id!, { logDelay: opt.value })}
                            style={[styles.chip, active && styles.chipActive]}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* ── Section 3: Lab-specific (only if subject has labs) ── */}
                  {hasLabs && (
                    <View style={[styles.section, styles.labSection]}>
                      <View style={styles.sectionHeader}>
                        <Ionicons name="flask-outline" size={13} color="#FAD7A1" />
                        <Text style={[styles.sectionTitle, { color: '#FAD7A1' }]}>LAB SESSIONS (2 hours)</Text>
                      </View>

                      {/* Mid-lab toggle */}
                      <View style={styles.toggleRow}>
                        <Text style={styles.toggleLabel}>Notify at 1-hour mark (mid-lab)</Text>
                        <Switch
                          value={pref.labMidEnabled}
                          onValueChange={val => update(subj.id!, { labMidEnabled: val })}
                          trackColor={{ false: colors.border, true: '#FAD7A1' }}
                          thumbColor={Platform.OS === 'android' ? (pref.labMidEnabled ? '#fff' : '#aaa') : '#fff'}
                          style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                          disabled={disabled}
                        />
                      </View>

                      {/* Post-lab log reminder */}
                      <Text style={[styles.sectionSubtitle, { marginTop: 8 }]}>After lab ends, log reminder:</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                        {LOG_DELAY_OPTIONS.map(opt => {
                          const active = pref.labEndDelay === opt.value;
                          return (
                            <TouchableOpacity
                              key={opt.value}
                              disabled={disabled}
                              onPress={() => update(subj.id!, { labEndDelay: opt.value })}
                              style={[styles.chip, active && styles.chipLabActive]}
                            >
                              <Text style={[styles.chipText, active && styles.chipLabTextActive]}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ height: 24 }} />
          </ScrollView>
        )}

        {/* Save footer */}
        {!loading && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={styles.saveBtnText}>Save &amp; Apply Notifications</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (colors: any) => StyleSheet.create({
  root:             { flex: 1, backgroundColor: colors.background },
  header:           { flexDirection: 'row', alignItems: 'flex-start', padding: SPACE.xl, borderBottomWidth: 1, borderColor: colors.border, gap: SPACE.md },
  headerTitle:      { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: colors.textPrimary },
  headerSub:        { fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  closeBtn:         { padding: 8, borderRadius: 20, backgroundColor: colors.surface },
  infoBanner:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: SPACE.md, padding: SPACE.md, backgroundColor: `${colors.accentPrimary}18`, borderRadius: RADIUS.md, borderWidth: 1, borderColor: `${colors.accentPrimary}30` },
  infoText:         { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  card:             { backgroundColor: colors.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, padding: SPACE.md, gap: SPACE.md },
  subjectRow:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  subjectName:      { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary },
  subjectDays:      { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  section:          { paddingTop: SPACE.sm, borderTopWidth: 1, borderColor: colors.border, gap: 4 },
  labSection:       { borderTopColor: 'rgba(250,215,161,0.3)' },
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle:     { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: colors.textMuted, letterSpacing: 0.8, flex: 1 },
  sectionSubtitle:  { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  toggleRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel:      { fontSize: 12, color: colors.textSecondary, flex: 1 },
  chip:             { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  chipActive:       { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
  chipLabActive:    { backgroundColor: 'rgba(250,215,161,0.2)', borderColor: '#FAD7A1' },
  chipText:         { fontSize: 12, color: colors.textSecondary },
  chipTextActive:   { color: '#000', fontWeight: '700' },
  chipLabTextActive:{ color: '#FAD7A1', fontWeight: '700' },
  footer:           { padding: SPACE.xl, borderTopWidth: 1, borderColor: colors.border },
  saveBtn:          { backgroundColor: colors.accentPrimary, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center' },
  saveBtnText:      { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#000' },
});
