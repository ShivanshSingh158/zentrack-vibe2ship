/**
 * BlockCalendar.tsx — Dynamic Phase Calendar
 *
 * Reads the roadmap start date and custom phases from placement_config and calculates:
 * - Current phase
 * - Current week within phase
 * - Days remaining in phase
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';
import { PlacementConfig, RoadmapPhase, usePlacementData } from '../../hooks/usePlacementData';
import { feedback } from '../../utils/haptics';

// ─── Block Calculator ─────────────────────────────────────────────────────────

interface CurrentPhaseInfo {
  phase: RoadmapPhase | null;
  weekInPhase: number;
  dayInWeek: number;
  dayInPhase: number;
  daysRemainingInPhase: number;
  totalDaysElapsed: number;
  status: 'Not started' | 'In progress' | 'Completed';
  phaseIndex: number;
}

function calculateCurrentPhase(startDateStr: string, phases: RoadmapPhase[]): CurrentPhaseInfo {
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const totalDaysElapsed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (totalDaysElapsed < 0 || phases.length === 0) {
    return {
      phase: phases[0] || null, weekInPhase: 0, dayInWeek: 0,
      dayInPhase: 0, daysRemainingInPhase: phases[0] ? phases[0].durationDays : 0,
      totalDaysElapsed: 0, status: 'Not started', phaseIndex: 0,
    };
  }

  let elapsed = totalDaysElapsed;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const lengthDays = p.durationDays;
    if (elapsed < lengthDays) {
      const dayInPhase = elapsed + 1;
      const weekInPhase = Math.ceil(dayInPhase / 7);
      const dayInWeek = ((dayInPhase - 1) % 7) + 1;
      const daysRemainingInPhase = lengthDays - elapsed;
      return {
        phase: p, weekInPhase, dayInWeek, dayInPhase,
        daysRemainingInPhase, totalDaysElapsed, status: 'In progress', phaseIndex: i,
      };
    }
    elapsed -= lengthDays;
  }

  // Past all phases
  return {
    phase: phases[phases.length - 1] || null, weekInPhase: 0, dayInWeek: 0,
    dayInPhase: 0, daysRemainingInPhase: 0,
    totalDaysElapsed, status: 'Completed', phaseIndex: phases.length - 1,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface BlockCalendarProps {
  config: PlacementConfig;
  onSetStartDate?: () => void;
  compact?: boolean;
}

export default function BlockCalendar({ config, onSetStartDate, compact = false }: BlockCalendarProps) {
  const { colors } = useTheme();
  const { updateConfig } = usePlacementData();
  const [editMode, setEditMode] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseDays, setNewPhaseDays] = useState('');

  const phases = config.phases || [];
  const info = useMemo(() => calculateCurrentPhase(config.startDate, phases), [config.startDate, phases]);

  const p = info.phase;
  const pct = p ? (info.dayInPhase / p.durationDays) * 100 : 100;

  const handleAddPhase = () => {
    if (!newPhaseName.trim() || !newPhaseDays.trim()) return;
    const newPhase: RoadmapPhase = {
      id: `ph_${Date.now()}`,
      name: newPhaseName.trim(),
      durationDays: parseInt(newPhaseDays, 10) || 30,
      description: '',
    };
    updateConfig({ phases: [...phases, newPhase] }).catch(() => {});
    setNewPhaseName('');
    setNewPhaseDays('');
  };

  const handleDeletePhase = (id: string) => {
    Alert.alert('Delete Phase', 'Are you sure you want to delete this phase?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        updateConfig({ phases: phases.filter(ph => ph.id !== id) }).catch(() => {});
      }}
    ]);
  };

  if (editMode) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={[styles.card, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Roadmap Phases</Text>
          <TouchableOpacity onPress={() => setEditMode(false)}>
            <Text style={{ color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs }}>DONE</Text>
          </TouchableOpacity>
        </View>

        {phases.map((ph, idx) => (
          <View key={ph.id} style={[styles.phaseEditRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm }}>
                {idx + 1}. {ph.name}
              </Text>
              <Text style={{ color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold, fontSize: 10, marginVertical: 2 }}>
                {ph.durationDays} DAYS
              </Text>
              {ph.description ? (
                <Text style={{ color: colors.textSecondary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, marginTop: 2 }}>
                  {ph.description}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => handleDeletePhase(ph.id)}>
              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ marginTop: SPACE.lg, gap: SPACE.sm }}>
          <Text style={{ color: colors.textMuted, fontFamily: FONT_FAMILY.bold, fontSize: 10, letterSpacing: 1 }}>ADD PHASE</Text>
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <TextInput
              style={[styles.input, { flex: 2, color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Phase name..."
              placeholderTextColor={colors.textMuted}
              value={newPhaseName}
              onChangeText={setNewPhaseName}
            />
            <TextInput
              style={[styles.input, { flex: 1, color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Days..."
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={newPhaseDays}
              onChangeText={setNewPhaseDays}
            />
          </View>
          <TouchableOpacity onPress={handleAddPhase} style={[styles.saveBtn, { backgroundColor: colors.accentPrimary }]}>
            <Text style={{ color: '#fff', fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm }}>Add Phase</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  if (!p) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>No Phases Configured</Text>
        <TouchableOpacity onPress={() => setEditMode(true)} style={{ marginTop: SPACE.md }}>
          <Text style={{ color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold }}>Setup Timeline</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{p.name}</Text>
            <TouchableOpacity onPress={() => setEditMode(true)}>
              <Ionicons name="pencil-outline" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Phase {info.phaseIndex + 1} of {phases.length}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={[styles.badgeText, { color: colors.accentPrimary }]}>
            Week {info.weekInPhase} / {Math.ceil(p.durationDays / 7)}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={{ marginBottom: SPACE.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
            Day {info.dayInWeek} of week {info.weekInPhase}
          </Text>
          <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
            {info.daysRemainingInPhase} days left in phase
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { backgroundColor: colors.accentPrimary, width: `${Math.min(Math.max(pct, 0), 100)}%` as any }]} />
        </View>
      </View>

      {/* Info Row */}
      {p.description ? (
        <View style={styles.infoRow}>
          <View style={[styles.iconBox, { backgroundColor: `${colors.accentPrimary}15` }]}>
            <Ionicons name="flag-outline" size={16} color={colors.accentPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>FOCUS</Text>
            <Text style={[styles.infoVal, { color: colors.textPrimary }]} numberOfLines={2}>
              {p.description}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Show all phases toggle */}
      <TouchableOpacity 
        style={{ marginTop: SPACE.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: SPACE.xs }}
        onPress={() => setEditMode(true)}
      >
        <Ionicons name="map-outline" size={14} color={colors.textSecondary} />
        <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 10, letterSpacing: 1, color: colors.textSecondary }}>VIEW FULL ROADMAP</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.lg, marginBottom: SPACE.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.lg },
  title: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.md, backgroundColor: '#a599ff15' },
  badgeText: { fontFamily: FONT_FAMILY.bold, fontSize: 10 },
  
  progressLabel: { fontFamily: FONT_FAMILY.medium, fontSize: 10 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  iconBox: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 9, letterSpacing: 1, marginBottom: 2 },
  infoVal: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs },
  
  phaseEditRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACE.sm, borderBottomWidth: 1 },
  input: { borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACE.md, paddingVertical: 8, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm },
  saveBtn: { borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACE.sm },
});
