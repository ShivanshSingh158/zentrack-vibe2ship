import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import BottomSheet from '../ui/BottomSheet';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { collection, query, where, getDocs, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { TaskTemplate } from '../../contexts/MobileDataContext';
import * as Haptics from 'expo-haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onApplyTemplate: (template: TaskTemplate) => void;
}

export default function TaskTemplatesSheet({ visible, onClose, userId, onApplyTemplate }: Props) {
  const { colors, isDark } = useTheme();
  const s = makeStyles(colors, isDark);
  
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create mode state
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'low'|'medium'|'high'>('medium');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [newSubtasks, setNewSubtasks] = useState<{ id: string; title: string; completed: boolean }[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);

  useEffect(() => {
    if (visible && userId) {
      loadTemplates();
    }
  }, [visible, userId]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'task_templates'), where('userId', '==', userId));
      const snap = await getDocs(q);
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaskTemplate));
      
      // Auto-seed if empty
      if (fetched.length === 0) {
        const seedTemplate: Omit<TaskTemplate, 'id'> = {
          userId,
          title: 'Morning Routine',
          priority: 'medium',
          timeSlot: '08:00 - 09:00',
          subtasks: [
            { id: 'st1', title: 'Make bed', completed: false },
            { id: 'st2', title: 'Drink water', completed: false },
            { id: 'st3', title: 'Review today\'s goals', completed: false },
            { id: 'st4', title: 'Light stretching', completed: false },
          ]
        };
        const newRef = await addDoc(collection(db, 'task_templates'), {
          ...seedTemplate,
          createdAt: serverTimestamp()
        });
        setTemplates([{ id: newRef.id, ...seedTemplate }]);
      } else {
        setTemplates(fetched);
      }
    } catch (e) {
      console.error('Failed to load task templates', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!newTitle.trim()) return;
    
    const timeSlot = newStartTime ? (newEndTime ? `${newStartTime} - ${newEndTime}` : newStartTime) : undefined;
    
    const newTemplate: Omit<TaskTemplate, 'id'> = {
      userId,
      title: newTitle.trim(),
      priority: newPriority,
      timeSlot,
      subtasks: newSubtasks,
      isRecurring,
      recurringDays: isRecurring ? recurringDays : undefined,
    };
    
    const newRef = await addDoc(collection(db, 'task_templates'), {
      ...newTemplate,
      createdAt: serverTimestamp()
    });
    
    setTemplates(prev => [...prev, { id: newRef.id, ...newTemplate }]);
    setIsCreating(false);
    resetForm();
  };

  const resetForm = () => {
    setNewTitle('');
    setNewPriority('medium');
    setNewStartTime('');
    setNewEndTime('');
    setNewSubtasks([]);
    setIsRecurring(false);
    setRecurringDays([]);
  };

  const addSubtask = () => {
    setNewSubtasks(prev => [...prev, { id: Date.now().toString(), title: '', completed: false }]);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={s.header}>
        <Ionicons name="copy-outline" size={24} color={colors.accentPrimary} />
        <Text style={s.title}>Task Templates</Text>
      </View>
      <Text style={s.subtitle}>Quickly create tasks with pre-defined subtasks and settings.</Text>

      {loading ? (
        <Text style={{ color: colors.textMuted, marginVertical: 20 }}>Loading templates...</Text>
      ) : isCreating ? (
        <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
          <Text style={s.label}>Template Name</Text>
          <TextInput
            style={s.input}
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="e.g. Morning Routine"
            placeholderTextColor={colors.textMuted}
          />
          
          <Text style={s.label}>Priority</Text>
          <View style={s.priorityRow}>
            {['low', 'medium', 'high'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[s.priorityBtn, newPriority === p && { backgroundColor: colors.accentPrimary }]}
                onPress={() => setNewPriority(p as any)}
              >
                <Text style={[s.priorityText, newPriority === p && { color: '#000' }]}>{p.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>Time Slot (Optional)</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              value={newStartTime}
              onChangeText={setNewStartTime}
              placeholder="e.g. 08:00"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              value={newEndTime}
              onChangeText={setNewEndTime}
              placeholder="e.g. 09:00"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.md }}>
            <Text style={[s.label, { marginBottom: 0 }]}>Recurring Template</Text>
            <TouchableOpacity onPress={() => setIsRecurring(!isRecurring)}>
              <Ionicons name={isRecurring ? "checkbox" : "square-outline"} size={24} color={isRecurring ? colors.accentPrimary : colors.textMuted} />
            </TouchableOpacity>
          </View>
          
          {isRecurring && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xl }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => {
                const selected = recurringDays.includes(idx);
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.border },
                      selected && { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary }
                    ]}
                    onPress={() => {
                      if (selected) setRecurringDays(prev => prev.filter(d => d !== idx));
                      else setRecurringDays(prev => [...prev, idx]);
                    }}
                  >
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: selected ? '#000' : colors.textPrimary }}>{day}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Text style={s.label}>Subtasks</Text>
          {newSubtasks.map((st, i) => (
            <View key={st.id} style={{ flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <Ionicons name="ellipse-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0, paddingVertical: 8 }]}
                value={st.title}
                onChangeText={(val) => setNewSubtasks(prev => prev.map((item, idx) => idx === i ? { ...item, title: val } : item))}
                placeholder="Subtask name"
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity onPress={() => setNewSubtasks(prev => prev.filter((_, idx) => idx !== i))}>
                <Ionicons name="trash-outline" size={18} color="#FF6961" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 8 }} onPress={addSubtask}>
            <Ionicons name="add" size={18} color={colors.accentPrimary} />
            <Text style={{ color: colors.accentPrimary, fontFamily: FONT_FAMILY.medium, marginLeft: 4 }}>Add Subtask</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]} onPress={() => { setIsCreating(false); resetForm(); }}>
              <Text style={[s.actionBtnText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.accentPrimary }]} onPress={handleSaveTemplate}>
              <Text style={[s.actionBtnText, { color: '#000' }]}>Save Template</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
          {templates.map(t => (
            <TouchableOpacity 
              key={t.id} 
              style={s.templateCard} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onApplyTemplate(t);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={s.templateTitle}>{t.title}</Text>
              <View style={s.metaRow}>
                {t.isRecurring && <Text style={[s.metaText, { color: colors.accentPrimary }]}><Ionicons name="repeat" size={12}/> Recurring</Text>}
                {t.timeSlot && <Text style={s.metaText}><Ionicons name="time-outline" size={12}/> {t.timeSlot}</Text>}
                <Text style={s.metaText}><Ionicons name="list-outline" size={12}/> {t.subtasks?.length || 0} subtasks</Text>
              </View>
            </TouchableOpacity>
          ))}
          
          <TouchableOpacity style={s.createBtn} onPress={() => setIsCreating(true)}>
            <Ionicons name="add" size={20} color={colors.accentPrimary} />
            <Text style={s.createBtnText}>Create New Template</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  sheetContent: {
    padding: SPACE.lg,
    paddingBottom: SPACE.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.lg,
  },
  title: {
    fontFamily: FONT_FAMILY.title,
    fontSize: FONT_SIZE.lg,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
    marginBottom: SPACE.xl,
  },
  list: {
    maxHeight: 400,
  },
  templateCard: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.surface2,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  templateTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
    marginBottom: SPACE.xs,
  },
  metaRow: {
    flexDirection: 'row',
    gap: SPACE.lg,
  },
  metaText: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs,
    color: colors.textMuted,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginBottom: SPACE.xl,
  },
  createBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
  },
  label: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
    marginBottom: SPACE.xs,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.surface2,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.medium,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
    marginBottom: SPACE.lg,
  },
  priorityBtn: {
    flex: 1,
    paddingVertical: SPACE.sm,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : colors.surface2,
  },
  priorityText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: colors.textPrimary,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  actionBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
  }
});
