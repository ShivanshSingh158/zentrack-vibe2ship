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
  isDark = true,
}: {
  options: { key: T; label: string }[];
  value: T | null;
  onSelect: (v: T) => void;
  colors: any;
  isDark?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const isSelected = value === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => { feedback.tap(); onSelect(opt.key); }}
            style={[
              s.pill,
              {
                borderColor: isSelected ? colors.accentPrimary : (isDark ? 'rgba(255,255,255,0.08)' : colors.border),
                backgroundColor: isSelected
                  ? (isDark ? '#251e3d' : 'rgba(108,92,231,0.12)')
                  : (isDark ? '#14121d' : '#F5F4FA'),
              },
            ]}
          >
            <Text
              style={[
                s.pillText,
                {
                  color: isSelected ? colors.accentPrimary : (isDark ? 'rgba(255,255,255,0.65)' : colors.textPrimary),
                  fontFamily: isSelected ? FONT_FAMILY.bold : FONT_FAMILY.body,
                },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function GymProfileModal({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const p = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { gymProfile, saveGymProfile } = useGymProfile();

  const [draft, setDraft] = useState<GymProfile>(DEFAULT_PROFILE);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setDraft(gymProfile);
      const g = gymProfile.goal as any;
      if (Array.isArray(g)) {
        setSelectedGoals(g);
      } else if (typeof g === 'string' && g.length > 0) {
        setSelectedGoals(g.split(','));
      } else {
        setSelectedGoals(g ? [g] : []);
      }
      const fm = gymProfile?.focusMuscles;
      if (typeof fm === 'string' && fm.trim().length > 0) {
        setSelectedMuscles(fm.split(',').map(m => m.trim()).filter(Boolean));
      } else if (Array.isArray(fm)) {
        setSelectedMuscles(fm.filter(Boolean));
      } else {
        setSelectedMuscles([]);
      }
    }
  }, [visible, gymProfile]);

  const set = <K extends keyof GymProfile>(key: K, val: GymProfile[K]) =>
    setDraft(prev => ({ ...prev, [key]: val }));

  const toggleGoal = (key: string) => {
    feedback.tap();
    setSelectedGoals(prev => {
      let next: string[];
      if (prev.includes(key)) {
        next = prev.filter(k => k !== key);
      } else {
        if (prev.length >= 2) {
          next = [prev[1], key];
        } else {
          next = [...prev, key];
        }
      }
      set('goal', (next.join(',') || null) as any);
      return next;
    });
  };

  const toggleMuscle = (muscle: string) => {
    feedback.tap();
    setSelectedMuscles(prev => {
      const next = prev.includes(muscle)
        ? prev.filter(m => m !== muscle)
        : [...prev, muscle];
      set('focusMuscles', next.join(','));
      return next;
    });
  };

  const handleSave = async () => {
    feedback.commit();
    await saveGymProfile({
      ...draft,
      goal: (selectedGoals.join(',') || null) as any,
      focusMuscles: selectedMuscles.join(','),
    });
    onClose();
  };

  const GOALS: { key: GymProfile['goal']; label: string; icon: string }[] = [
    { key: 'hypertrophy', label: '💪 Muscle Size', icon: 'barbell-outline' },
    { key: 'strength', label: '🏋️ Max Strength', icon: 'fitness-outline' },
    { key: 'fat_loss', label: '🔥 Fat Loss', icon: 'flame-outline' },
    { key: 'athletic', label: '⚡ Athletic', icon: 'flash-outline' },
  ];
  const MAJOR_MUSCLES = [
    'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
    'Forearms', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs / Core',
  ];
  const EXP = [
    { key: 'beginner' as const, label: 'Beginner (<1 yr)' },
    { key: 'intermediate' as const, label: 'Intermediate (1-3 yr)' },
    { key: 'advanced' as const, label: 'Advanced (3+ yr)' },
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
      <View style={p.overlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={p.sheet}
        >
          {/* Drag Handle */}
          <View style={p.handle} />

          {/* Header */}
          <View style={p.header}>
            <View style={p.headerLeft}>
              <View style={p.iconBadge}>
                <Ionicons name="fitness" size={20} color={colors.accentPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={p.title} numberOfLines={1}>Athlete Profile</Text>
                <Text style={p.subtitle} numberOfLines={1}>GYM-GPT personalized coaching</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={p.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

            {/* Body Stats */}
            <Text style={p.sectionLabel}>BODY STATS</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <View style={{ flex: 1 }}>
                <Text style={p.label}>Height (cm)</Text>
                <TextInput
                  style={p.input}
                  placeholder="e.g. 175"
                  placeholderTextColor={colors.textMuted}
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
                  placeholderTextColor={colors.textMuted}
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
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={draft.age?.toString() || ''}
                  onChangeText={v => set('age', v ? parseInt(v, 10) : null)}
                />
              </View>
            </View>

            {/* Gender */}
            <Text style={p.sectionLabel}>GENDER</Text>
            <View style={{ marginBottom: 20 }}>
              <OptionPill options={GENDERS} value={draft.gender} onSelect={v => set('gender', v)} colors={colors} isDark={isDark} />
            </View>

            {/* Goal - Single Line Horizontal Scroll with up to 2 multi-selection */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={p.sectionLabel}>PRIMARY GOALS (MAX 2)</Text>
              <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 11, color: selectedGoals.length > 0 ? colors.accentPrimary : colors.textMuted, marginBottom: 10 }}>
                {selectedGoals.length}/2 selected
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12, marginBottom: 20 }}>
              {GOALS.map(g => {
                const isSelected = selectedGoals.includes(g.key!);
                return (
                  <TouchableOpacity
                    key={g.key!}
                    onPress={() => toggleGoal(g.key!)}
                    style={[p.goalPill, isSelected && p.goalPillActive]}
                  >
                    <Text style={{ fontSize: 16 }}>{g.label.split(' ')[0]}</Text>
                    <Text style={[p.goalPillText, { color: isSelected ? colors.accentPrimary : (isDark ? 'rgba(255,255,255,0.7)' : colors.textPrimary), fontFamily: isSelected ? FONT_FAMILY.bold : FONT_FAMILY.medium }]}>
                      {g.label.split(' ').slice(1).join(' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Target Focus Muscles */}
            <Text style={p.sectionLabel}>TARGET FOCUS MUSCLES</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {MAJOR_MUSCLES.map(m => {
                const isSelected = selectedMuscles.includes(m);
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => toggleMuscle(m)}
                    style={[
                      s.pill,
                      {
                        borderColor: isSelected ? colors.accentPrimary : (isDark ? 'rgba(255,255,255,0.08)' : colors.border),
                        backgroundColor: isSelected
                          ? (isDark ? '#251e3d' : 'rgba(108,92,231,0.12)')
                          : (isDark ? '#14121d' : '#F5F4FA'),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.pillText,
                        {
                          color: isSelected ? colors.accentPrimary : (isDark ? 'rgba(255,255,255,0.65)' : colors.textPrimary),
                          fontFamily: isSelected ? FONT_FAMILY.bold : FONT_FAMILY.medium,
                        },
                      ]}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Experience */}
            <Text style={p.sectionLabel}>TRAINING EXPERIENCE</Text>
            <View style={{ marginBottom: 20 }}>
              <OptionPill options={EXP} value={draft.experience} onSelect={v => set('experience', v)} colors={colors} isDark={isDark} />
            </View>

            {/* Days per week */}
            <Text style={p.sectionLabel}>TRAINING DAYS / WEEK</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              {DAYS.map(d => {
                const isSelected = draft.daysPerWeek === d;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => { feedback.tap(); set('daysPerWeek', d); }}
                    style={[p.dayPill, isSelected && p.dayPillActive]}
                  >
                    <Text style={[p.dayPillText, { color: isSelected ? colors.accentPrimary : (isDark ? 'rgba(255,255,255,0.7)' : colors.textPrimary) }]}>{d}x</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Exercises to avoid */}
            <Text style={p.sectionLabel}>EXERCISES TO AVOID</Text>
            <TextInput
              style={[p.input, p.textArea]}
              placeholder="e.g. deadlifts, pull-ups, leg press..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
              value={draft.exercisesToAvoid}
              onChangeText={v => set('exercisesToAvoid', v)}
            />
          </ScrollView>

          {/* Save Button */}
          <TouchableOpacity style={p.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <Ionicons name="sparkles" size={18} color={isDark ? '#080510' : '#FFFFFF'} />
            <Text style={p.saveBtnText}>Save Profile — GYM-GPT Ready</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 12,
      paddingHorizontal: 20,
      maxHeight: '92%',
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomWidth: 0,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: isDark ? 0.5 : 0.15,
      shadowRadius: 24,
      elevation: 16,
    },
    handle: {
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
      alignSelf: 'center',
      marginBottom: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    headerLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginRight: 12,
    },
    iconBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 20,
      color: colors.textPrimary,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: colors.accentPrimary,
      letterSpacing: 1.5,
      marginBottom: 10,
    },
    label: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 12,
      color: colors.textTertiary,
      marginBottom: 6,
    },
    input: {
      backgroundColor: isDark ? '#161422' : '#F5F4FA',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(165,153,255,0.2)' : colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      height: 48,
      fontFamily: FONT_FAMILY.medium,
      fontSize: 15,
      color: colors.textPrimary,
    },
    textArea: {
      height: 'auto' as any,
      paddingVertical: 12,
      textAlignVertical: 'top',
      marginBottom: 0,
    },
    goalPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: isDark ? '#14121d' : '#F5F4FA',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
      gap: 6,
    },
    goalPillActive: {
      borderColor: colors.accentPrimary,
      backgroundColor: isDark ? '#251e3d' : 'rgba(108,92,231,0.12)',
      shadowColor: colors.accentPrimary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.35 : 0.15,
      shadowRadius: 8,
      elevation: 0,
    },
    goalPillText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 13,
      backgroundColor: 'transparent',
      includeFontPadding: false,
    },
    dayPill: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#14121d' : '#F5F4FA',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    },
    dayPillActive: {
      borderColor: colors.accentPrimary,
      backgroundColor: isDark ? '#251e3d' : 'rgba(108,92,231,0.12)',
      shadowColor: colors.accentPrimary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.15,
      shadowRadius: 8,
      elevation: 0,
    },
    dayPillText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 16,
      backgroundColor: 'transparent',
      includeFontPadding: false,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: isDark ? '#a599ff' : colors.accentPrimary,
      borderRadius: 26,
      height: 52,
      marginBottom: Platform.OS === 'ios' ? 32 : 16,
      marginTop: 12,
      shadowColor: colors.accentPrimary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.45 : 0.25,
      shadowRadius: 14,
      elevation: 8,
    },
    saveBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 15,
      color: isDark ? '#080510' : '#FFFFFF',
      backgroundColor: 'transparent',
      includeFontPadding: false,
    },
  });

// Thin alias for the existing style object in modal context
const s = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    backgroundColor: 'transparent',
    includeFontPadding: false,
  },
});
