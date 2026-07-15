import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { db } from '../../services/firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { useMobileData, AttendanceSubject } from '../../contexts/MobileDataContext';

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
  const { user, attendance } = useMobileData();
  const [name, setName] = useState('');
  const [targetPercentage, setTargetPercentage] = useState('75');
  const [schedule, setSchedule] = useState<any>(defaultSchedule);
  const [loading, setLoading] = useState(false);
  const [activePicker, setActivePicker] = useState<{ dayIdx: number, type: 'classes' | 'labs', idx: number } | null>(null);

  useEffect(() => {
    if (visible) {
      if (existingSubject) {
        setName(existingSubject.name);
        setTargetPercentage(existingSubject.targetPercentage?.toString() || '75');
        
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
        setSchedule(defaultSchedule);
      }
    }
  }, [visible, existingSubject]);

  const handleSave = async () => {
    if (!name.trim() || !user) return;
    setLoading(true);
    try {
      const target = parseInt(targetPercentage) || 75;
      if (existingSubject) {
        updateDoc(doc(db, 'attendance_subjects', existingSubject.id!), {
          name: name.trim(),
          targetPercentage: target,
          schedule,
        }).catch(e => console.log('Subject update error:', e));
      } else {
        addDoc(collection(db, 'attendance_subjects'), {
          userId: user.uid,
          name: name.trim(),
          classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0,
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
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Subject Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Physics 101"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Target Percentage (%)</Text>
              <TextInput
                style={styles.input}
                placeholder="75"
                keyboardType="numeric"
                placeholderTextColor={COLORS.textMuted}
                value={targetPercentage}
                onChangeText={setTargetPercentage}
              />
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
                        <Ionicons name="add" size={14} color={COLORS.accentPrimary} />
                        <Text style={styles.addBtnText}>Class</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => addSession(dayIdx, 'labs')} style={styles.addBtn}>
                        <Ionicons name="add" size={14} color={COLORS.accentBlue} />
                        <Text style={[styles.addBtnText, { color: COLORS.accentBlue }]}>Lab</Text>
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
                        <Text style={{ color: cls.time ? COLORS.textPrimary : COLORS.textMuted }}>
                          {cls.time || "Time"}
                        </Text>
                      </TouchableOpacity>
                      <TextInput style={styles.sessionInput} placeholder="Room" placeholderTextColor={COLORS.textMuted} value={cls.room} onChangeText={(t) => updateSession(dayIdx, 'classes', idx, 'room', t)} />
                      <TouchableOpacity style={{ padding: 4 }} onPress={() => removeSession(dayIdx, 'classes', idx)}>
                        <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  
                  {labs.map((lab: any, idx: number) => (
                    <View key={`lab-${idx}`} style={styles.sessionRow}>
                      <Text style={[styles.sessionType, { color: COLORS.accentBlue }]}>Lab</Text>
                      <TouchableOpacity
                        style={[styles.sessionInput, { justifyContent: 'center' }]}
                        onPress={() => setActivePicker({ dayIdx, type: 'labs', idx })}
                      >
                        <Text style={{ color: lab.time ? COLORS.textPrimary : COLORS.textMuted }}>
                          {lab.time || "Time"}
                        </Text>
                      </TouchableOpacity>
                      <TextInput style={styles.sessionInput} placeholder="Room" placeholderTextColor={COLORS.textMuted} value={lab.room} onChangeText={(t) => updateSession(dayIdx, 'labs', idx, 'room', t)} />
                      <TouchableOpacity style={{ padding: 4 }} onPress={() => removeSession(dayIdx, 'labs', idx)}>
                        <Ionicons name="trash-outline" size={16} color={COLORS.error} />
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

const styles = StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: COLORS.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACE.xl, paddingBottom: 40, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg },
  modalTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xl, color: COLORS.textPrimary },
  
  inputGroup: { marginBottom: SPACE.xl },
  label: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginBottom: SPACE.sm },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACE.md, color: COLORS.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base },
  
  dayCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: SPACE.md, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface2, padding: SPACE.md, borderBottomWidth: 1, borderColor: COLORS.border },
  dayText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: COLORS.textPrimary },
  dayActions: { flexDirection: 'row', gap: SPACE.sm },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: RADIUS.sm },
  addBtnText: { color: COLORS.accentPrimary, fontSize: 12, fontWeight: 'bold' },
  
  sessionRow: { flexDirection: 'row', alignItems: 'center', padding: SPACE.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, gap: SPACE.sm },
  sessionType: { width: 40, fontSize: 11, fontWeight: 'bold', color: COLORS.accentPrimary },
  sessionInput: { flex: 1, backgroundColor: COLORS.background, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },

  saveBtn: { backgroundColor: COLORS.textPrimary, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACE.lg },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: COLORS.background, fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base },
});
