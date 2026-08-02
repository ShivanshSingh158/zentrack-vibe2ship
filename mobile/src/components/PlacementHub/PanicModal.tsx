/**
 * PanicModal.tsx — ZenTrack Placement Hub Burnout & Workload Management Modal
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';

interface PanicModalProps {
  visible: boolean;
  onClose: () => void;
  onTakeBufferDay: () => void;
  onLightSession: () => void;
  onTalkToSara: () => void;
  onShiftRoadmap?: (days: number) => void;
}

export default function PanicModal({
  visible,
  onClose,
  onTakeBufferDay,
  onLightSession,
  onTalkToSara,
  onShiftRoadmap,
}: PanicModalProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" presentationStyle="overFullScreen">
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.centeredView}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconBadge, { backgroundColor: '#ef444420' }]}>
              <Ionicons name="heart-outline" size={24} color="#ef4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Burnout & Load Rebalance</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Studying 44 hrs/week + college is hard. Take a moment to recalibrate.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Action Options */}
          <View style={styles.optionsContainer}>
            
            {/* Option 1: Shift Entire Roadmap +1 Day */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.optionCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}
              onPress={() => {
                feedback.success();
                onShiftRoadmap?.(1);
                onClose();
              }}
            >
              <Ionicons name="time-outline" size={22} color="#f59e0b" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>Shift Roadmap +1 Day</Text>
                <Text style={[styles.optionDesc, { color: colors.textMuted }]}>
                  Missed today? Move all 11 blocks forward by 1 day. Absorbed by upcoming Buffer week!
                </Text>
              </View>
            </TouchableOpacity>

            {/* Option 2: Take Buffer Day */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.optionCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}
              onPress={() => {
                feedback.tap();
                onTakeBufferDay();
                onClose();
              }}
            >
              <Ionicons name="cafe-outline" size={22} color="#3b82f6" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>Take a Rest / Buffer Day</Text>
                <Text style={[styles.optionDesc, { color: colors.textMuted }]}>
                  Shift today's heavy topics to your upcoming Buffer week. Zero guilt.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Option 3: 50% Light Mode */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.optionCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}
              onPress={() => {
                feedback.tap();
                onLightSession();
                onClose();
              }}
            >
              <Ionicons name="leaf-outline" size={22} color="#22c55e" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>50% Light Mode Today</Text>
                <Text style={[styles.optionDesc, { color: colors.textMuted }]}>
                  Cut today's target to 1 DSA problem + 30 mins Dev. Maintain your streak effortlessly.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Option 4: Talk to S.A.R.A */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.optionCard, { backgroundColor: '#a855f715', borderColor: '#a855f740' }]}
              onPress={() => {
                feedback.success();
                onTalkToSara();
                onClose();
              }}
            >
              <Ionicons name="sparkles" size={22} color="#a855f7" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: '#a855f7' }]}>Talk to S.A.R.A. Co-Pilot</Text>
                <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                  Let S.A.R.A algorithmically reschedule your roadmap to prevent burnout.
                </Text>
              </View>
            </TouchableOpacity>

          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACE.lg,
  },
  modalContent: {
    width: '100%',
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    padding: SPACE.lg,
    gap: SPACE.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
    lineHeight: 18,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsContainer: {
    gap: SPACE.md,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
  },
  optionTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
  },
  optionDesc: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
    lineHeight: 16,
  },
});
