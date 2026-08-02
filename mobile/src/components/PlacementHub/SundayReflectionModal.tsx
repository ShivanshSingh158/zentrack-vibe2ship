/**
 * SundayReflectionModal.tsx — ZenTrack Placement Hub Sunday Debrief
 *
 * Implements the 4 weekly reflection questions prescribed by the 6-Month Placement Roadmap.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';

interface SundayReflectionModalProps {
  visible: boolean;
  onClose: () => void;
  onRewardXP?: (xp: number) => void;
}

export default function SundayReflectionModal({ visible, onClose, onRewardXP }: SundayReflectionModalProps) {
  const { colors } = useTheme();

  const [q1, setQ1] = useState<'Yes' | 'Mostly' | 'Need Practice' | null>(null);
  const [q2, setQ2] = useState<'Yes' | 'Working on it' | null>(null);
  const [q3, setQ3] = useState<'Yes (4+ Days)' | 'No' | null>(null);
  const [q4, setQ4] = useState('');

  const handleSubmit = () => {
    feedback.success();
    onRewardXP?.(100);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen">
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
            <Ionicons name="calendar-outline" size={20} color="#10b981" />
            <Text style={[styles.title, { color: colors.textPrimary }]}>Sunday Debrief</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textMuted, marginBottom: SPACE.md }}>
          Weekly 4-question check-in from your 6-Month Roadmap to lock in progress.
        </Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.lg, paddingBottom: SPACE.lg }}>
          
          {/* Question 1 */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.questionText, { color: colors.textPrimary }]}>
              1. Can I solve this week's DSA problems without hints?
            </Text>
            <View style={styles.chipRow}>
              {(['Yes', 'Mostly', 'Need Practice'] as const).map(option => (
                <TouchableOpacity
                  key={option}
                  onPress={() => {
                    feedback.tap();
                    setQ1(option);
                  }}
                  style={[
                    styles.chip,
                    { backgroundColor: q1 === option ? '#10b98120' : colors.surface2, borderColor: q1 === option ? '#10b981' : colors.border }
                  ]}
                >
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: q1 === option ? '#10b981' : colors.textSecondary }}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Question 2 */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.questionText, { color: colors.textPrimary }]}>
              2. Can I explain this week's dev concept simply?
            </Text>
            <View style={styles.chipRow}>
              {(['Yes', 'Working on it'] as const).map(option => (
                <TouchableOpacity
                  key={option}
                  onPress={() => {
                    feedback.tap();
                    setQ2(option);
                  }}
                  style={[
                    styles.chip,
                    { backgroundColor: q2 === option ? '#10b98120' : colors.surface2, borderColor: q2 === option ? '#10b981' : colors.border }
                  ]}
                >
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: q2 === option ? '#10b981' : colors.textSecondary }}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Question 3 */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.questionText, { color: colors.textPrimary }]}>
              3. Did I write code for at least 4 days this week?
            </Text>
            <View style={styles.chipRow}>
              {(['Yes (4+ Days)', 'No'] as const).map(option => (
                <TouchableOpacity
                  key={option}
                  onPress={() => {
                    feedback.tap();
                    setQ3(option);
                  }}
                  style={[
                    styles.chip,
                    { backgroundColor: q3 === option ? '#10b98120' : colors.surface2, borderColor: q3 === option ? '#10b981' : colors.border }
                  ]}
                >
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: q3 === option ? '#10b981' : colors.textSecondary }}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Question 4 */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.questionText, { color: colors.textPrimary }]}>
              4. What is 1 thing I understand today that I didn't last week?
            </Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              value={q4}
              onChangeText={setQ4}
              placeholder="e.g. Understood Promises microtask vs macrotask queue..."
              placeholderTextColor={colors.textMuted}
              multiline
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            style={[styles.submitBtn, { backgroundColor: '#10b981' }]}
          >
            <Ionicons name="checkmark-done" size={18} color="#fff" />
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: '#fff' }}>
              Complete Sunday Debrief (+100 XP)
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    marginTop: 80,
    marginHorizontal: SPACE.md,
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    padding: SPACE.lg,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.xs,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.lg,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    padding: SPACE.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    gap: SPACE.sm,
  },
  questionText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.xs,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  input: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.sm,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    minHeight: 60,
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: RADIUS.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: SPACE.xs,
  },
});
