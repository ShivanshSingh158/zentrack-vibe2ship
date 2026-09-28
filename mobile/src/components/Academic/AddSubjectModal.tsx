import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, Pressable, Dimensions, BackHandler, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BlurView } from 'expo-blur';
import Reanimated, {
  LinearTransition,
  FadeIn,
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { db } from '../../services/firebase';
import { collection, addDoc, updateDoc, doc, setDoc } from 'firebase/firestore';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { useAcademicData } from '../../contexts/domains/AcademicContext';
import type { AttendanceSubject } from '../../contexts/MobileDataContext';
import { COLLECTION } from '../../config/constants';
import { useTheme } from "../../contexts/ThemeContext";

const SCREEN_HEIGHT = Dimensions.get('window').height;
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
// Map visual index to actual Date.getDay() (0=Sun, 1=Mon)
const DAY_MAP = [1, 2, 3, 4, 5, 6, 0];

// ── Helper to resolve initial form values synchronously without 2nd-render flash ──
function getInitialSubjectState(existingSubject?: AttendanceSubject | null) {
  if (existingSubject) {
    const hasExistingCounts = (existingSubject.classesTotal || 0) > 0 || (existingSubject.labsTotal || 0) > 0;
    const subjectHasLabs = (existingSubject.labsTotal || 0) > 0 || (existingSubject.labsAttended || 0) > 0;
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
    return {
      name: existingSubject.name || '',
      targetPercentage: existingSubject.targetPercentage?.toString() || '75',
      calibrationMode: (hasExistingCounts ? 'mid_semester' : 'fresh') as 'fresh' | 'mid_semester',
      classesAttended: existingSubject.classesAttended ? existingSubject.classesAttended.toString() : '0',
      classesTotal: existingSubject.classesTotal ? existingSubject.classesTotal.toString() : '0',
      hasLabs: subjectHasLabs,
      labsAttended: existingSubject.labsAttended ? existingSubject.labsAttended.toString() : '0',
      labsTotal: existingSubject.labsTotal ? existingSubject.labsTotal.toString() : '0',
      schedule: migratedSchedule,
    };
  }
  return {
    name: '',
    targetPercentage: '75',
    calibrationMode: 'fresh' as 'fresh' | 'mid_semester',
    classesAttended: '',
    classesTotal: '',
    hasLabs: false,
    labsAttended: '',
    labsTotal: '',
    schedule: defaultSchedule,
  };
}

// ── Apple iOS-Grade Tactile Spring Pressable ──────────────────────────────────
const SpringPressableBtn = React.memo(function SpringPressableBtn({
  onPress,
  children,
  style,
  disabled = false,
  activeScale = 0.95,
  haptic = 'light',
}: {
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
  disabled?: boolean;
  activeScale?: number;
  haptic?: 'light' | 'medium';
}) {
  const handlePress = useCallback(() => {
    if (disabled) return;
    if (haptic === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  }, [disabled, haptic, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        style,
        pressed && !disabled && { opacity: 0.65, transform: [{ scale: activeScale }] },
      ]}
    >
      {children}
    </Pressable>
  );
});

export const AddSubjectModal = React.memo(function AddSubjectModal({ visible, onClose, existingSubject }: {
  visible: boolean;
  onClose: () => void;
  existingSubject?: AttendanceSubject | null;
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { user } = useCoreData();
  const { attendance, optimisticAddSubject, optimisticUpdateAttendance } = useAcademicData();

  const [name, setName] = useState(() => getInitialSubjectState(existingSubject).name);
  const [targetPercentage, setTargetPercentage] = useState(() => getInitialSubjectState(existingSubject).targetPercentage);
  const [schedule, setSchedule] = useState<any>(() => getInitialSubjectState(existingSubject).schedule);
  const [loading, setLoading] = useState(false);
  const [activePicker, setActivePicker] = useState<{ dayIdx: number, type: 'classes' | 'labs', idx: number } | null>(null);

  // ── Mid-Semester Calibration State ──
  const [calibrationMode, setCalibrationMode] = useState<'fresh' | 'mid_semester'>(() => getInitialSubjectState(existingSubject).calibrationMode);
  const [classesAttended, setClassesAttended] = useState(() => getInitialSubjectState(existingSubject).classesAttended);
  const [classesTotal, setClassesTotal] = useState(() => getInitialSubjectState(existingSubject).classesTotal);
  const [hasLabs, setHasLabs] = useState(() => getInitialSubjectState(existingSubject).hasLabs);
  const [labsAttended, setLabsAttended] = useState(() => getInitialSubjectState(existingSubject).labsAttended);
  const [labsTotal, setLabsTotal] = useState(() => getInitialSubjectState(existingSubject).labsTotal);

  // Synchronize state during render on open to avoid secondary re-render flash
  const [prevVisible, setPrevVisible] = useState(visible);
  const [prevSubjectId, setPrevSubjectId] = useState<string | null | undefined>(existingSubject?.id);

  if (visible !== prevVisible || (visible && existingSubject?.id !== prevSubjectId)) {
    setPrevVisible(visible);
    setPrevSubjectId(existingSubject?.id);
    if (visible) {
      const init = getInitialSubjectState(existingSubject);
      setName(init.name);
      setTargetPercentage(init.targetPercentage);
      setCalibrationMode(init.calibrationMode);
      setClassesAttended(init.classesAttended);
      setClassesTotal(init.classesTotal);
      setHasLabs(init.hasLabs);
      setLabsAttended(init.labsAttended);
      setLabsTotal(init.labsTotal);
      setSchedule(init.schedule);
    }
  }

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

      if (existingSubject && existingSubject.id) {
        // SAFETY: in edit mode, only overwrite attendance counts if the user explicitly
        // chose mid_semester calibration. 'fresh' in edit context means:
        // "keep my existing counts, I'm only editing the name/target/schedule".
        // Previously this would overwrite all counts with 0 when calibrationMode='fresh',
        // silently destroying the entire semester's attendance record.
        const payload: any = {
          name: name.trim(),
          targetPercentage: target,
          schedule,
        };
        if (calibrationMode === 'mid_semester') {
          payload.classesAttended = cAtt;
          payload.classesTotal    = cTot;
          payload.labsAttended    = lAtt;
          payload.labsTotal       = lTot;
        }
        optimisticUpdateAttendance(existingSubject.id, payload);
        updateDoc(doc(db, COLLECTION.ATTENDANCE, existingSubject.id), payload).catch(e => console.log('Subject update error:', e));
      } else {
        const subId = doc(collection(db, COLLECTION.ATTENDANCE)).id;
        const newSubject: AttendanceSubject = {
          id: subId,
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
        };
        optimisticAddSubject(newSubject);
        setDoc(doc(db, COLLECTION.ATTENDANCE, subId), newSubject).catch(e => console.log('Subject add error:', e));
      }
      handleRequestClose();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const isClosingRef = React.useRef(false);

  const handleRequestClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Keyboard.dismiss();
    backdropOpacity.value = withTiming(0, {
      duration: 220,
      easing: Easing.linear,
    });
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      {
        duration: 260,
        easing: Easing.bezier(0.32, 0, 0.67, 0),
      },
      (finished) => {
        if (finished) {
          runOnJS(setMounted)(false);
          runOnJS(onClose)();
          isClosingRef.current = false;
        }
      }
    );
  }, [backdropOpacity, translateY, onClose]);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setMounted(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      translateY.value = SCREEN_HEIGHT;
      translateY.value = withTiming(0, {
        duration: 320,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      });
      backdropOpacity.value = withTiming(1, {
        duration: 260,
        easing: Easing.out(Easing.quad),
      });
    } else if (mounted) {
      handleRequestClose();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleRequestClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, handleRequestClose]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

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

  if (!mounted) return null;

  return (
    <Modal visible={mounted} animationType="none" transparent onRequestClose={handleRequestClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Reanimated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.70)' : 'rgba(0,0,0,0.4)' }, backdropAnimatedStyle]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={25} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.45)' }]} />
          )}
          <Pressable style={StyleSheet.absoluteFill} onPress={handleRequestClose} />
        </Reanimated.View>

        <Reanimated.View
          style={[styles.modalSheet, sheetAnimatedStyle]}
        >
          {/* iOS Sheet Grab Handle */}
          <Pressable onPress={handleRequestClose} hitSlop={{ top: 12, bottom: 12, left: 30, right: 30 }}>
            <View style={styles.handleContainer}>
              <View style={styles.sheetHandle} />
            </View>
          </Pressable>

          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{existingSubject ? 'Edit Subject' : 'Add Subject'}</Text>
            <TouchableOpacity onPress={handleRequestClose} style={styles.closeBtn} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color={colors.textPrimary} />
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
                  <Ionicons name="sparkles-outline" size={14} color={calibrationMode === 'fresh' ? (isDark ? '#000000' : '#FFFFFF') : colors.textMuted} />
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
                  <Ionicons name="calculator-outline" size={14} color={calibrationMode === 'mid_semester' ? (isDark ? '#000000' : '#FFFFFF') : colors.textMuted} />
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
                    <View style={[styles.previewCard, { borderColor: previewData.safe ? (isDark ? 'rgba(94,218,158,0.3)' : 'rgba(16,185,129,0.25)') : (isDark ? 'rgba(255,105,97,0.3)' : 'rgba(239,68,68,0.25)') }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT_FAMILY.bold, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Calibrated Starting Baseline
                        </Text>
                        <Text style={{ fontSize: 16, fontFamily: FONT_FAMILY.bold, color: previewData.safe ? colors.priorityLow : colors.error }}>
                          {previewData.pct}%
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, color: previewData.safe ? colors.priorityLow : (isDark ? '#fca5a5' : colors.error), fontFamily: FONT_FAMILY.medium }}>
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
                      <SpringPressableBtn
                        onPress={() => addSession(dayIdx, 'classes')}
                        style={styles.addBtn}
                        activeScale={0.88}
                        haptic="light"
                      >
                        <Ionicons name="add" size={14} color={colors.accentPrimary} />
                        <Text style={styles.addBtnText}>Class</Text>
                      </SpringPressableBtn>
                      <SpringPressableBtn
                        onPress={() => addSession(dayIdx, 'labs')}
                        style={styles.addBtn}
                        activeScale={0.88}
                        haptic="light"
                      >
                        <Ionicons name="add" size={14} color={colors.accentBlue} />
                        <Text style={[styles.addBtnText, { color: colors.accentBlue }]}>Lab</Text>
                      </SpringPressableBtn>
                    </View>
                  </View>
                  
                  {classes.map((cls: any, idx: number) => (
                    <Reanimated.View
                      key={`class-${idx}`}
                      layout={LinearTransition.duration(200).easing(Easing.bezier(0.16, 1, 0.3, 1))}
                      exiting={FadeOut.duration(140)}
                      style={styles.sessionRow}
                    >
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
                    </Reanimated.View>
                  ))}
                  
                  {labs.map((lab: any, idx: number) => (
                    <Reanimated.View
                      key={`lab-${idx}`}
                      layout={LinearTransition.duration(200).easing(Easing.bezier(0.16, 1, 0.3, 1))}
                      exiting={FadeOut.duration(140)}
                      style={styles.sessionRow}
                    >
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
                    </Reanimated.View>
                  ))}
                </View>
              );
            })}
          </ScrollView>

          <SpringPressableBtn 
            style={[styles.saveBtn, (!name.trim() || loading) && styles.saveBtnDisabled]} 
            onPress={handleSave} 
            disabled={!name.trim() || loading}
            haptic="medium"
          >
            <Text style={styles.saveBtnText}>{loading ? 'Saving...' : (existingSubject ? 'Save Changes' : 'Add Subject')}</Text>
          </SpringPressableBtn>
          
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
                  // iOS inline wheel picker: always close after a time is selected.
                  // Without this the picker stays open until the user manually dismisses it.
                  if (Platform.OS === 'ios') setActivePicker(null);
                }
                if (Platform.OS === 'ios' && event.type === 'dismissed') {
                  setActivePicker(null);
                }
              }}
            />
          )}
        </Reanimated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.70)' : 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SPACE.xl,
    paddingTop: 10,
    paddingBottom: 40,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border,
    borderBottomWidth: 0,
  },
  handleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginBottom: 6,
  },
  sheetHandle: {
    width: 36,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.18)',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: FONT_SIZE.xl, color: colors.textPrimary },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : 'rgba(0, 0, 0, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  inputGroup: { marginBottom: SPACE.xl },
  label: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textMuted, marginBottom: SPACE.sm },
  input: {
    backgroundColor: isDark ? '#0d0d10' : '#F5F4FA',
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.base
  },
  
  // ── Segmented Control Styles ──
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: isDark ? '#0d0d10' : '#EAE9F2',
    borderRadius: RADIUS.lg,
    padding: 3,
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border,
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
    backgroundColor: colors.accentPrimary,
  },
  segmentBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  segmentBtnTextActive: {
    fontFamily: FONT_FAMILY.bold,
    color: isDark ? '#000000' : '#FFFFFF',
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
    backgroundColor: isDark ? '#000000' : '#F8F7FC',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border,
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
    backgroundColor: isDark ? '#0d0d10' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border,
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
    backgroundColor: isDark ? '#0d0d10' : '#FFFFFF',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border,
    padding: SPACE.md,
  },

  dayCard: {
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
    borderRadius: RADIUS.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border,
    overflow: 'hidden'
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: isDark ? '#0d0d10' : '#F5F4FA',
    padding: SPACE.md,
    borderBottomWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border
  },
  dayText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary },
  dayActions: { flexDirection: 'row', gap: SPACE.sm },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: isDark ? '#0d0d10' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border,
    borderRadius: RADIUS.sm
  },
  addBtnText: { color: colors.accentPrimary, fontSize: 12, fontWeight: 'bold' },
  
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? '#1c1c20' : colors.border,
    gap: SPACE.sm
  },
  sessionType: { width: 40, fontSize: 11, fontWeight: 'bold', color: colors.accentPrimary },
  sessionInput: {
    flex: 1,
    backgroundColor: isDark ? '#0d0d10' : '#F5F4FA',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border
  },

  saveBtn: { backgroundColor: colors.accentPrimary, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACE.lg },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: isDark ? '#000000' : '#FFFFFF', fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base },
});
