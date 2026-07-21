/**
 * AddCardioModal — ZenTrack Mobile
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, SPACE, RADIUS, FONT_SIZE } from '../../theme/tokens';
import { useTheme } from "../../contexts/ThemeContext";

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (type: string) => void;
}

const CARDIO_TYPES = [
  'Cycling', 'Stairmaster', 'Elliptical', 'Rowing',
  'Outdoor Run', 'Jump Rope', 'Swimming', 'Other'
];

export function AddCardioModal({ visible, onClose, onAdd }: Props) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const handleAdd = () => {
    if (selectedType) {
      onAdd(selectedType);
      setSelectedType(null);
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Extra Cardio</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="walk" size={16} color={colors.textMuted} />
            <Text style={styles.infoText}>Treadmill is always included. Add any extra cardio here.</Text>
          </View>

          <ScrollView contentContainerStyle={styles.pillsContainer}>
            {CARDIO_TYPES.map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.pill, selectedType === type && styles.pillSelected]}
                onPress={() => setSelectedType(type)}
              >
                <Text style={[styles.pillText, selectedType === type && styles.pillTextSelected]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.addBtn, !selectedType && styles.addBtnDisabled]}
            disabled={!selectedType}
            onPress={handleAdd}
          >
            <Text style={styles.addBtnText}>Add Cardio Session</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      modalBg: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
      },
      sheet: {
        backgroundColor: colors.background,
        borderTopLeftRadius: RADIUS.xl,
        borderTopRightRadius: RADIUS.xl,
        padding: SPACE.lg,
        paddingBottom: Platform.OS === 'ios' ? 40 : SPACE.xl,
        minHeight: 400,
      },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACE.md,
      },
      title: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 20,
        color: colors.textPrimary,
      },
      closeBtn: {
        padding: SPACE.xs,
        backgroundColor: colors.surface,
        borderRadius: 20,
      },
      infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(196, 144, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(196, 144, 255, 0.3)',
        borderRadius: RADIUS.md,
        padding: SPACE.sm,
        marginBottom: SPACE.lg,
        gap: SPACE.sm,
      },
      infoText: {
        flex: 1,
        fontFamily: FONT_FAMILY.body,
        fontSize: 12,
        color: colors.textMuted,
      },
      pillsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACE.sm,
        paddingBottom: SPACE.lg,
      },
      pill: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: RADIUS.sm,
        backgroundColor: '#1C1C1E',
        borderWidth: 1,
        borderColor: colors.border,
      },
      pillSelected: {
        backgroundColor: 'rgba(255, 69, 58, 0.1)',
        borderColor: 'rgba(255, 69, 58, 0.3)',
      },
      pillText: {
        fontFamily: FONT_FAMILY.body,
        fontSize: 14,
        color: colors.textMuted,
      },
      pillTextSelected: {
        fontFamily: FONT_FAMILY.bold,
        color: '#FF453A',
      },
      addBtn: {
        backgroundColor: '#C490FF',
        borderRadius: RADIUS.md,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: SPACE.sm,
      },
      addBtnDisabled: {
        backgroundColor: '#3C3C3E',
      },
      addBtnText: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 16,
        color: colors.background,
      },
    });
