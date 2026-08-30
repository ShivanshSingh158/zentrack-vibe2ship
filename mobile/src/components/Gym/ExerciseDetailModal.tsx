/**
 * ExerciseDetailModal.tsx — ZenTrack Mobile
 *
 * Full Screen / Sheet Inspection Modal for any Exercise:
 * - Shows high-quality looping form animation (GIF).
 * - Target & Synergist muscle breakdowns.
 * - Multi-lingual instructions (EN / HI).
 * - Equipment requirements and quick addition button.
 */
import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import ExerciseAnimationCard from './ExerciseAnimationCard';

interface ExerciseDetailModalProps {
  visible: boolean;
  onClose: () => void;
  exerciseName: string;
  onOpenYoutube?: () => void;
}

export function ExerciseDetailModal({
  visible,
  onClose,
  exerciseName,
  onOpenYoutube,
}: ExerciseDetailModalProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: isDark ? '#0c0c10' : '#FFFFFF',
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {exerciseName}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <ExerciseAnimationCard
              exerciseName={exerciseName}
              onOpenYoutube={onOpenYoutube}
              showInstructions={true}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default ExerciseDetailModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    flex: 1,
    textTransform: 'capitalize',
  },
  closeBtn: {
    padding: 4,
    marginLeft: 12,
  },
  scrollContent: {
    padding: 16,
  },
});
