/**
 * GymProfileModal.tsx — ZenTrack Mobile
 *
 * Full athlete profile form linked directly to GYM-GPT.
 * Captures: height, weight, age, gender, goal, experience,
 *           equipment, days/week, injuries, exercises to avoid, notes.
 *
 * Saved to AsyncStorage key 'gym_profile_v1' instantly on Save.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useGymProfile, GymProfile, DEFAULT_PROFILE } from '../../hooks/useGymProfile';
import { feedback } from '../../utils/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type SingleValue<T extends string> = T | null;

function OptionPill<T extends string>({
  options,
  value,
  onSelect,
  colors,
}: {
  options: { key: T; label: string }[];
  value: T | null;
  onSelect: (v: T) => void;
  colors: any;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.key}
          onPress={() => { feedback.tap(); onSelect(opt.key); }}
          style={[
            s.pill,
            { borderColor: value === opt.key ? '#a599ff' : colors.border, backgroundColor: value === opt.key ? 'rgba(165,153,255,0.15)' : colors.surface },
          ]}
        >
          <Text style={[s.pillText, { color: value === opt.key ? '#a599ff' : colors.textSecondary, fontFamily: value === opt.key ? FONT_FAMILY.bold : FONT_FAMILY.body }]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function GymProfileModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { gymProfile, saveGymProfile } = useGymProfile();

  const [draft, setDraft] = useState<GymProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    if (visible) setDraft(gymProfile);
  }, [visible, gymProfile]);

  const set = <K extends keyof GymProfile>(key: K, val: GymProfile[K]) =>
    setDraft(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    feedback.commit();
    await saveGymProfile(draft);
    onClose();
  };

  const GOALS: { key: GymProfile['goal']; label: string; icon: string }[] = [
    { key: 'hypertrophy', label: '💪 Muscle Size', icon: 'barbell-outline' },
    { key: 'strength', label: '🏋️ Max Strength', icon: 'fitness-outline' },
    { key: 'fat_loss', label: '🔥 Fat Loss', icon: 'flame-outline' },
    { key: 'athletic', label: '⚡ Athletic', icon: 'flash-outline' },
  ];
  const EXP = [
    { key: 'beginner' as const, label: 'Beginner\n(<1 yr)' },
    { key: 'intermediate' as const, label: 'Intermediate\n(1-3 yr)' },
    { key: 'advanced' as const, label: 'Advanced\n(3+ yr)' },
  ];
  const EQUIP = [
    { key: 'full_gym' as const, label: '🏟️ Full Gym' },
    { key: 'home_gym' as const, label: '🏠 Home Gym' },
    { key: 'bodyweight' as const, label: '🤸 Bodyweight' },
  ];
  const GENDERS = [
    { key: 'male' as const, label: 'Male' },
    { key: 'female' as const, label: 'Female' },
    { key: 'other' as const, label: 'Other' },
  ];
  const DAYS = [3, 4, 5, 6];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[p.overlay, { flex: 1, justifyContent: 'flex-end' }]}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={[p.sheet, { backgroundColor: '#121214' }]}
        >


            {/* Header */}
            <View style={p.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={p.iconBadge}>
                  <Ionicons name="person-circle-outline" size={22} color="#a599ff" />
                </View>
                <View>
                  <Text style={p.title}>Athlete Profile</Text>
                  <Text style={p.subtitle}>GYM-GPT uses this to personalise every response</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={p.closeBtn}>
                <Ionicons name="close" size={22} color="#8e8e93" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

              {/* Body Stats */}
              <Text style={p.sectionLabel}>BODY STATS</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={p.label}>Height (cm)</Text>
                  <TextInput
                    style={p.input}
                    placeholder="e.g. 175"
                    placeholderTextColor="#636366"
                    keyboardType="numeric"
                    value={draft.heightCm?.toString() || ''}
                    onChangeText={v => set('heightCm', v ? parseFloat(v) : null)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={p.label}>Weight (kg)</Text>
                  <TextInput
                    style={p.input}
                    placeholder="e.g. 75"
                    placeholderTextColor="#636366"
                    keyboardType="numeric"
                    value={draft.weightKg?.toString() || ''}
                    onChangeText={v => set('weightKg', v ? parseFloat(v) : null)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={p.label}>Age</Text>
                  <TextInput
                    style={p.input}
                    placeholder="e.g. 22"
                    placeholderTextColor="#636366"
                    keyboardType="numeric"
                    value={draft.age?.toString() || ''}
                    onChangeText={v => set('age', v ? parseInt(v, 10) : null)}
                  />
                </View>
              </View>

              {/* Gender */}
              <Text style={p.label}>Gender</Text>
              <View style={{ marginBottom: 20 }}>
                <OptionPill options={GENDERS} value={draft.gender} onSelect={v => set('gender', v)} colors={{ border: '#2c2c2e', surface: '#1c1c1e', textSecondary: '#aeaeb2' }} />
              </View>

              {/* Goal */}
              <Text style={p.sectionLabel}>PRIMARY GOAL</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                {GOALS.map(g => (
                  <TouchableOpacity
                    key={g.key!}
                    onPress={() => { feedback.tap(); set('goal', g.key); }}
                    style={[p.goalCard, draft.goal === g.key && p.goalCardActive]}
                  >
                    <Text style={p.goalEmoji}>{g.label.split(' ')[0]}</Text>
                    <Text style={[p.goalLabel, { color: draft.goal === g.key ? '#a599ff' : '#aeaeb2' }]}>
                      {g.label.split(' ').slice(1).join(' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Experience */}
              <Text style={p.sectionLabel}>TRAINING EXPERIENCE</Text>
              <View style={{ marginBottom: 20 }}>
                <OptionPill options={EXP} value={draft.experience} onSelect={v => set('experience', v)} colors={{ border: '#2c2c2e', surface: '#1c1c1e', textSecondary: '#aeaeb2' }} />
              </View>

              {/* Equipment */}
              <Text style={p.sectionLabel}>EQUIPMENT AVAILABLE</Text>
              <View style={{ marginBottom: 20 }}>
                <OptionPill options={EQUIP} value={draft.equipment} onSelect={v => set('equipment', v)} colors={{ border: '#2c2c2e', surface: '#1c1c1e', textSecondary: '#aeaeb2' }} />
              </View>

              {/* Days per week */}
              <Text style={p.sectionLabel}>TRAINING DAYS / WEEK</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                {DAYS.map(d => (
                  <TouchableOpacity
                    key={d}
                    onPress={() => { feedback.tap(); set('daysPerWeek', d); }}
                    style={[p.dayPill, draft.daysPerWeek === d && p.dayPillActive]}
                  >
                    <Text style={[p.dayPillText, { color: draft.daysPerWeek === d ? '#a599ff' : '#aeaeb2' }]}>{d}x</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Limitations */}
              <Text style={p.sectionLabel}>INJURIES / LIMITATIONS</Text>
              <TextInput
                style={[p.input, p.textArea]}
                placeholder="e.g. lower back pain, bad knees, shoulder impingement..."
                placeholderTextColor="#636366"
                multiline
                numberOfLines={3}
                value={draft.limitations}
                onChangeText={v => set('limitations', v)}
              />

              {/* Exercises to avoid */}
              <Text style={[p.sectionLabel, { marginTop: 16 }]}>EXERCISES TO AVOID</Text>
              <TextInput
                style={[p.input, p.textArea]}
                placeholder="e.g. deadlifts, pull-ups, leg press..."
                placeholderTextColor="#636366"
                multiline
                numberOfLines={2}
                value={draft.exercisesToAvoid}
                onChangeText={v => set('exercisesToAvoid', v)}
              />

              {/* Notes */}
              <Text style={[p.sectionLabel, { marginTop: 16 }]}>OTHER PREFERENCES</Text>
              <TextInput
                style={[p.input, p.textArea]}
                placeholder="e.g. prefer compound movements, no machines, short rest periods..."
                placeholderTextColor="#636366"
                multiline
                numberOfLines={2}
                value={draft.notes}
                onChangeText={v => set('notes', v)}
              />
            </ScrollView>

            {/* Save */}
            <TouchableOpacity style={p.saveBtn} onPress={handleSave} activeOpacity={0.85}>
              <Ionicons name="checkmark-circle" size={20} color="#000" />
              <Text style={p.saveBtnText}>Save Profile — GYM-GPT will use this</Text>
            </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const p = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20, paddingHorizontal: 20, maxHeight: '92%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  iconBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(165,153,255,0.12)', borderWidth: 1, borderColor: 'rgba(165,153,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: '#f2f2f7' },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: '#636366', marginTop: 2 },
  closeBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14 },
  sectionLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: '#636366', letterSpacing: 1.5, marginBottom: 10 },
  label: { fontFamily: FONT_FAMILY.medium, fontSize: 12, color: '#8e8e93', marginBottom: 6 },
  input: { backgroundColor: '#1c1c1e', borderWidth: 1, borderColor: '#2c2c2e', borderRadius: 14, paddingHorizontal: 14, height: 46, fontFamily: FONT_FAMILY.body, fontSize: 15, color: '#f2f2f7' },
  textArea: { height: 'auto' as any, paddingVertical: 12, textAlignVertical: 'top', marginBottom: 0 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  pillText: { fontFamily: FONT_FAMILY.body, fontSize: 13 },
  goalCard: { width: '47%', backgroundColor: '#1c1c1e', borderWidth: 1, borderColor: '#2c2c2e', borderRadius: 16, padding: 14, alignItems: 'center', gap: 6 },
  goalCardActive: { borderColor: '#a599ff', backgroundColor: 'rgba(165,153,255,0.1)' },
  goalEmoji: { fontSize: 26 },
  goalLabel: { fontFamily: FONT_FAMILY.medium, fontSize: 13, textAlign: 'center' },
  dayPill: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e', borderWidth: 1, borderColor: '#2c2c2e' },
  dayPillActive: { borderColor: '#a599ff', backgroundColor: 'rgba(165,153,255,0.12)' },
  dayPillText: { fontFamily: FONT_FAMILY.bold, fontSize: 16 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#a599ff', borderRadius: 18, paddingVertical: 16, marginBottom: Platform.OS === 'ios' ? 32 : 16, marginTop: 8 },
  saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#000' },
});

// Thin alias for the existing style object in modal context
const s = StyleSheet.create({
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  pillText: { fontFamily: FONT_FAMILY.body, fontSize: 13 },
});
