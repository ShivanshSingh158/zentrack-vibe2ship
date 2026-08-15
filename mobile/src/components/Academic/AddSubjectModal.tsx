import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { db } from '../../services/firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { useMobileData, AttendanceSubject } from '../../contexts/MobileDataContext';
import { COLLECTION } from '../../config/constants';
import { useTheme } from "../../contexts/ThemeContext";

const SCHEMA_VERSION = 1;
const defaultSchedule = {
  '0': { classes: [], labs: [] },
  '1': { classes: [{ time: '', room: '' }], labs: [] },
  '2': { classes: [{ time: '', room: '' }], labs: [] },
  '3': { classes: [{ time: '', room: '' }], labs: [] },
  '4': { classes: [{ time: '', room: '' }], labs: [] },
  '5': { classes: [{ time: '', room: '' }], labs: [] },
  '6': { classes: [], labs: [] },
};
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Map visual index to actual Date.getDay() (0=Sun, 1=Mon)
const DAY_MAP = [1, 2, 3, 4, 5, 6, 0];

export function AddSubjectModal({ visible, onClose, existingSubject }: {
  visible: boolean;
  onClose: () => void;
  existingSubject?: AttendanceSubject | null;
}) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const { user, attendance } = useMobileData();
  const [name, setName] = useState('');
  const [targetPercentage, setTargetPercentage] = useState('75');
  const [schedule, setSchedule] = useState<any>(defaultSchedule);
  const [loading, setLoading] = useState(false);
  const [activePicker, setActivePicker] = useState<{ dayIdx: number, type: 'classes' | 'labs', idx: number } | null>(null);

  // ── Mid-Semester Calibration State ──
  const [calibrationMode, setCalibrationMode] = useState<'fresh' | 'mid_semester'>('fresh');
  const [classesAttended, setClassesAttended] = useState('');
  const [classesTotal, setClassesTotal] = useState('');
  const [hasLabs, setHasLabs] = useState(false);
  const [labsAttended, setLabsAttended] = useState('');
  const [labsTotal, setLabsTotal] = useState('');

  useEffect(() => {
    if (visible) {
      if (existingSubject) {
        setName(existingSubject.name);
        setTargetPercentage(existingSubject.targetPercentage?.toString() || '75');
        
        const hasExistingCounts = (existingSubject.classesTotal || 0) > 0 || (existingSubject.labsTotal || 0) > 0;
        setCalibrationMode(hasExistingCounts ? 'mid_semester' : 'fresh');
        setClassesAttended(existingSubject.classesAttended ? existingSubject.classesAttended.toString() : '0');
        setClassesTotal(existingSubject.classesTotal ? existingSubject.classesTotal.toString() : '0');
        
        const subjectHasLabs = (existingSubject.labsTotal || 0) > 0 || (existingSubject.labsAttended || 0) > 0;
        setHasLabs(subjectHasLabs);
        setLabsAttended(existingSubject.labsAttended ? existingSubject.labsAttended.toString() : '0');
        setLabsTotal(existingSubject.labsTotal ? existingSubject.labsTotal.toString() : '0');

        const migratedSchedule: any = {};
        for (let i = 0; i < 7; i++) {
          const dStr = i.toString();
          const d = existingSubject.schedule?.[dStr] || { classCount: 0, labCount: 0, classes: [], labs: [] };
          
          let newClasses = d.classes || [];
          if (newClasses.length === 0 && d.classCount > 0) {
            newClasses = Array.from({ length: d.classCount }).map(() => ({ time: '', room: '' }));
          }
          
          let newLabs = d.labs || [];
          if (newLabs.length === 0 && d.labCount > 0) {
            newLabs = Array.from({ length: d.labCount }).map(() => ({ time: '', room: '' }));
          }
          
          migratedSchedule[dStr] = {
            classes: newClasses,
            labs: newLabs,
            classCount: newClasses.length,
            labCount: newLabs.length,
          };
        }
        setSchedule(migratedSchedule);
      } else {
        setName('');
        setTargetPercentage('75');
        setCalibrationMode('fresh');
        setClassesAttended('');
        setClassesTotal('');
        setHasLabs(false);
        setLabsAttended('');
        setLabsTotal('');
        setSchedule(defaultSchedule);
      }
    }
  }, [visible, existingSubject]);

  // ── Calibration Preview Calculations ──
  const previewData = useMemo(() => {
    if (calibrationMode === 'fresh') return null;
    const cAtt = Math.max(0, parseInt(classesAttended) || 0);
    const cTot = Math.max(0, parseInt(classesTotal) || 0);
    const lAtt = hasLabs ? Math.max(0, parseInt(labsAttended) || 0) : 0;
    const lTot = hasLabs ? Math.max(0, parseInt(labsTotal) || 0) : 0;
    const totalAtt = cAtt + lAtt;
    const totalTot = cTot + lTot;
    const target = parseInt(targetPercentage) || 75;

    if (totalTot === 0) return { pct: 100, safe: true, label: 'Enter held & attended counts to preview baseline' };
    const pct = (totalAtt / totalTot) * 100;
    const safe = pct >= target;

    if (safe) {
      const canMiss = Math.floor((totalAtt * 100 / target) - totalTot);
      return {
        pct: Math.round(pct * 10) / 10,
        safe: true,
        label: canMiss > 0 ? `✓ Starting Safe: Can miss up to ${canMiss} upcoming class${canMiss > 1 ? 'es' : ''}` : `⚠️ On the edge: 0 skips remaining at ${target}% target`,
      };
    } else {
      const need = Math.ceil((target * totalTot - 100 * totalAtt) / (100 - target));
      return {
        pct: Math.round(pct * 10) / 10,
        safe: false,
        label: `🚨 Starting Below Target: Need to attend next ${need} class${need > 1 ? 'es' : ''} in a row`,
      };
    }
  }, [calibrationMode, classesAttended, classesTotal, hasLabs, labsAttended, labsTotal, targetPercentage]);

  const handleSave = async () => {
    if (!name.trim() || !user) return;
    setLoading(true);
    try {
      const target = parseInt(targetPercentage) || 75;
      let cAtt = 0;
      let cTot = 0;
      let lAtt = 0;
      let lTot = 0;

      if (calibrationMode === 'mid_semester') {
        cAtt = Math.max(0, parseInt(classesAttended) || 0);
        cTot = Math.max(cAtt, parseInt(classesTotal) || 0);
        lAtt = hasLabs ? Math.max(0, parseInt(labsAttended) || 0) : 0;
        lTot = hasLabs ? Math.max(lAtt, parseInt(labsTotal) || 0) : 0;
      }

      if (existingSubject) {
        updateDoc(doc(db, COLLECTION.ATTENDANCE, existingSubject.id!), {
          name: name.trim(),
          targetPercentage: target,
          classesAttended: cAtt,
          classesTotal: cTot,
          labsAttended: lAtt,
          labsTotal: lTot,
          schedule,
        }).catch(e => console.log('Subject update error:', e));
      } else {
        addDoc(collection(db, COLLECTION.ATTENDANCE), {
          userId: user.uid,
          name: name.trim(),
          classesAttended: cAtt,
          classesTotal: cTot,
          labsAttended: lAtt,
          labsTotal: lTot,
          targetPercentage: target,
          order: attendance.length + 1,
          schedule,
          schemaVersion: SCHEMA_VERSION,
        }).catch(e => console.log('Subject add error:', e));
      }
      onClose();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const addSession = (dayIdx: number, type: 'classes' | 'labs') => {
    setSchedule((prev: any) => {
      const current = prev[dayIdx.toString()] || { classes: [], labs: [] };
      const arr = [...(current[type] || [])];
      arr.push({ time: '', room: '' });
      return {
        ...prev,
        [dayIdx.toString()]: { ...current, [type]: arr, [`${type === 'classes' ? 'classCount' : 'labCount'}`]: arr.length }
      };
    });
  };

  const removeSession = (dayIdx: number, type: 'classes' | 'labs', idx: number) => {
    setSchedule((prev: any) => {
      const current = prev[dayIdx.toString()] || { classes: [], labs: [] };
      const arr = [...(current[type] || [])];
      arr.splice(idx, 1);
      return {
        ...prev,
        [dayIdx.toString()]: { ...current, [type]: arr, [`${type === 'classes' ? 'classCount' : 'labCount'}`]: arr.length }
      };
    });
  };

  const updateSession = (dayIdx: number, type: 'classes' | 'labs', idx: number, field: 'time' | 'room', value: string) => {
    setSchedule((prev: any) => {
      const current = prev[dayIdx.toString()] || { classes: [], labs: [] };
      const arr = [...(current[type] || [])];
      arr[idx] = { ...arr[idx], [field]: value };
      return {
        ...prev,
        [dayIdx.toString()]: { ...current, [type]: arr }
      };
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{existingSubject ? 'Edit Subject' : 'Add Subject'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* Subject Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Subject Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Data Structures & Algorithms"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Target Percentage */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Target Percentage (%)</Text>
              <TextInput
                style={styles.input}
                placeholder="75"
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
                value={targetPercentage}
                onChangeText={setTargetPercentage}
              />
            </View>

            {/* ── Mid-Semester Calibration Segmented Control ── */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Starting Point Calibration</Text>
              <View style={styles.segmentedContainer}>
                <TouchableOpacity
                  style={[styles.segmentBtn, calibrationMode === 'fresh' && styles.segmentBtnActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCalibrationMode('fresh');
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="sparkles-outline" size={14} color={calibrationMode === 'fresh' ? '#000000' : colors.textMuted} />
                  <Text style={[styles.segmentBtnText, calibrationMode === 'fresh' && styles.segmentBtnTextActive]}>
                    Starting Fresh (0/0)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.segmentBtn, calibrationMode === 'mid_semester' && styles.segmentBtnActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCalibrationMode('mid_semester');
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calculator-outline" size={14} color={calibrationMode === 'mid_semester' ? '#000000' : colors.textMuted} />
                  <Text style={[styles.segmentBtnText, calibrationMode === 'mid_semester' && styles.segmentBtnTextActive]}>
                    Mid-Semester Baseline
                  </Text>
                </TouchableOpacity>
              </View>

              {calibrationMode === 'fresh' ? (
                <Text style={styles.helperText}>
                  ✨ Starting with 0 classes. You'll log attendance day-by-day as classes happen.
                </Text>
              ) : (
                <View style={styles.calibrationCard}>
                  <Text style={styles.calibrationCardHeader}>
                    Input your past attendance record to calibrate your baseline stats:
                  </Text>

                  {/* Classes count inputs */}
                  <View style={styles.calibrationRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.microLabel}>Classes Attended</Text>
                      <TextInput
                        style={styles.calibInput}
                        placeholder="e.g. 24"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={classesAttended}
                        onChangeText={setClassesAttended}
                      />
                    </View>
                    <Text style={styles.slashDivider}>/</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.microLabel}>Total Classes Held</Text>
                      <TextInput
                        style={styles.calibInput}
                        placeholder="e.g. 30"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={classesTotal}
                        onChangeText={setClassesTotal}
                      />
                    </View>
                  </View>

                  {/* Labs Toggle */}
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setHasLabs(!hasLabs);
                    }}
                    style={styles.labToggleRow}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name={hasLabs ? "checkbox" : "square-outline"} size={16} color={hasLabs ? colors.accentPrimary : colors.textMuted} />
                      <Text style={{ fontSize: 12, color: colors.textPrimary, fontFamily: FONT_FAMILY.medium }}>
                        Include Separate Lab Attendance
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {hasLabs && (
                    <View style={[styles.calibrationRow, { marginTop: SPACE.sm }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.microLabel}>Labs Attended</Text>
                        <TextInput
                          style={styles.calibInput}
                          placeholder="e.g. 5"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                          value={labsAttended}
                          onChangeText={setLabsAttended}
                        />
                      </View>
                      <Text style={styles.slashDivider}>/</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.microLabel}>Total Labs Held</Text>
                        <TextInput
                          style={styles.calibInput}
                          placeholder="e.g. 6"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                          value={labsTotal}
                          onChangeText={setLabsTotal}
                        />
                      </View>
                    </View>
                  )}

                  {/* Live Calibration Stats Preview */}
                  {previewData && (
                    <View style={[styles.previewCard, { borderColor: previewData.safe ? 'rgba(52,199,89,0.3)' : 'rgba(239,68,68,0.3)' }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT_FAMILY.bold, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Calibrated Starting Baseline
                        </Text>
                        <Text style={{ fontSize: 16, fontFamily: FONT_FAMILY.bold, color: previewData.safe ? '#34C759' : '#ef4444' }}>
                          {previewData.pct}%
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, color: previewData.safe ? '#34C759' : '#fca5a5', fontFamily: FONT_FAMILY.medium }}>
                        {previewData.label}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            <Text style={[styles.label, { marginBottom: SPACE.md }]}>Weekly Schedule (Classes / Labs)</Text>
            {DAYS.map((dayName, i) => {
              const dayIdx = DAY_MAP[i];
              const sched = schedule[dayIdx.toString()] || { classes: [], labs: [] };
              const classes = sched.classes || [];
              const labs = sched.labs || [];
              
              return (
                <View key={dayName} style={styles.dayCard}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayText}>{dayName}</Text>
                    <View style={styles.dayActions}>
                      <TouchableOpacity onPress={() => addSession(dayIdx, 'classes')} style={styles.addBtn}>
                        <Ionicons name="add" size={14} color={colors.accentPrimary} />
                        <Text style={styles.addBtnText}>Class</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => addSession(dayIdx, 'labs')} style={styles.addBtn}>
                        <Ionicons name="add" size={14} color={colors.accentBlue} />
                        <Text style={[styles.addBtnText, { color: colors.accentBlue }]}>Lab</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  {classes.map((cls: any, idx: number) => (
                    <View key={`class-${idx}`} style={styles.sessionRow}>
                      <Text style={styles.sessionType}>Class</Text>
                      <TouchableOpacity
                        style={[styles.sessionInput, { justifyContent: 'center' }]}
                        onPress={() => setActivePicker({ dayIdx, type: 'classes', idx })}
                      >
                        <Text style={{ color: cls.time ? colors.textPrimary : colors.textMuted }}>
                          {cls.time || "Time"}
                        </Text>
                      </TouchableOpacity>
                      <TextInput style={styles.sessionInput} placeholder="Room" placeholderTextColor={colors.textMuted} value={cls.room} onChangeText={(t) => updateSession(dayIdx, 'classes', idx, 'room', t)} />
                      <TouchableOpacity style={{ padding: 4 }} onPress={() => removeSession(dayIdx, 'classes', idx)}>
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  
                  {labs.map((lab: any, idx: number) => (
                    <View key={`lab-${idx}`} style={styles.sessionRow}>
                      <Text style={[styles.sessionType, { color: colors.accentBlue }]}>Lab</Text>
                      <TouchableOpacity
                        style={[styles.sessionInput, { justifyContent: 'center' }]}
                        onPress={() => setActivePicker({ dayIdx, type: 'labs', idx })}
                      >
                        <Text style={{ color: lab.time ? colors.textPrimary : colors.textMuted }}>
                          {lab.time || "Time"}
                        </Text>
                      </TouchableOpacity>
                      <TextInput style={styles.sessionInput} placeholder="Room" placeholderTextColor={colors.textMuted} value={lab.room} onChangeText={(t) => updateSession(dayIdx, 'labs', idx, 'room', t)} />
                      <TouchableOpacity style={{ padding: 4 }} onPress={() => removeSession(dayIdx, 'labs', idx)}>
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity 
            style={[styles.saveBtn, (!name.trim() || loading) && styles.saveBtnDisabled]} 
            onPress={handleSave} 
            disabled={!name.trim() || loading}
          >
            <Text style={styles.saveBtnText}>{loading ? 'Saving...' : (existingSubject ? 'Save Changes' : 'Add Subject')}</Text>
          </TouchableOpacity>
          
          {activePicker && (
            <DateTimePicker
              value={new Date()}
              mode="time"
              display="default"
              onChange={(event, selectedDate) => {
                if (Platform.OS === 'android') {
                  setActivePicker(null);
                }
                if (selectedDate && event.type !== 'dismissed') {
                  const hours = selectedDate.getHours();
                  const minutes = selectedDate.getMinutes();
                  const ampm = hours >= 12 ? 'PM' : 'AM';
                  const h = hours % 12 || 12;
                  const m = minutes < 10 ? `0${minutes}` : minutes;
                  const timeStr = `${h}:${m} ${ampm}`;
                  updateSession(activePicker.dayIdx, activePicker.type, activePicker.idx, 'time', timeStr);
                }
                if (Platform.OS === 'ios' && event.type === 'dismissed') {
                  setActivePicker(null);
                }
              }}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACE.xl, paddingBottom: 40, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg },
  modalTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xl, color: colors.textPrimary },
  
  inputGroup: { marginBottom: SPACE.xl },
  label: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textMuted, marginBottom: SPACE.sm },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.md, padding: SPACE.md, color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base },
  
  // ── Segmented Control Styles ──
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: SPACE.sm,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: colors.textPrimary,
  },
  segmentBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  segmentBtnTextActive: {
    fontFamily: FONT_FAMILY.bold,
    color: colors.background,
  },
  helperText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textTertiary,
    lineHeight: 18,
    marginTop: 2,
    paddingHorizontal: 2,
  },

  // ── Calibration Card Styles ──
  calibrationCard: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: SPACE.md,
    marginTop: 4,
  },
  calibrationCardHeader: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: SPACE.sm,
    lineHeight: 16,
  },
  calibrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  microLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  calibInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    textAlign: 'center',
  },
  slashDivider: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    color: colors.textTertiary,
    marginTop: 14,
    paddingHorizontal: 2,
  },
  labToggleRow: {
    marginTop: SPACE.md,
    paddingVertical: 4,
  },
  previewCard: {
    marginTop: SPACE.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACE.md,
  },

  dayCard: { backgroundColor: colors.surface, borderRadius: RADIUS.md, marginBottom: SPACE.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface2, padding: SPACE.md, borderBottomWidth: 1, borderColor: colors.border },
  dayText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary },
  dayActions: { flexDirection: 'row', gap: SPACE.sm },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: RADIUS.sm },
  addBtnText: { color: colors.accentPrimary, fontSize: 12, fontWeight: 'bold' },
  
  sessionRow: { flexDirection: 'row', alignItems: 'center', padding: SPACE.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: SPACE.sm },
  sessionType: { width: 40, fontSize: 11, fontWeight: 'bold', color: colors.accentPrimary },
  sessionInput: { flex: 1, backgroundColor: colors.background, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },

  saveBtn: { backgroundColor: colors.textPrimary, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACE.lg },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: colors.background, fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base },
});
