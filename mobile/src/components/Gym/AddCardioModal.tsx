/**
 * AddCardioModal — ZenTrack Mobile
 * Redesigned to match Gym screen's dark minimalist aesthetic.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import * as Haptics from 'expo-haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (type: string) => void;
}

const CARDIO_TYPES: { label: string; icon: string }[] = [
  { label: 'Treadmill',    icon: 'walk-outline' },
  { label: 'Cycling',      icon: 'bicycle-outline' },
  { label: 'Rowing',       icon: 'boat-outline' },
  { label: 'Stairmaster',  icon: 'trending-up-outline' },
  { label: 'Elliptical',   icon: 'sync-outline' },
  { label: 'Outdoor Run',  icon: 'footsteps-outline' },
  { label: 'Jump Rope',    icon: 'infinite-outline' },
  { label: 'Swimming',     icon: 'water-outline' },
  { label: 'Other',        icon: 'fitness-outline' },
];

export function AddCardioModal({ visible, onClose, onAdd }: Props) {
  const { colors, isDark } = useTheme();
  const s = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      setSelectedType(null);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(500);
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: 500,
      duration: 220,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleAdd = () => {
    if (!selectedType) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAdd(selectedType);
    setSelectedType(null);
    handleClose();
  };

  const handleSelect = (label: string) => {
    Haptics.selectionAsync();
    setSelectedType(label);
  };

  return (
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />

        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Drag Handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>Add Cardio</Text>
            <TouchableOpacity style={s.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Ionicons name="close" size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Cardio Type Grid */}
          <View style={s.grid}>
            {CARDIO_TYPES.map(({ label, icon }) => {
              const isSelected = selectedType === label;
              const isFullWidth = label === 'Other';

              return (
                <TouchableOpacity
                  key={label}
                  style={[
                    s.chip,
                    isFullWidth && s.chipFullWidth,
                    isSelected && s.chipSelected,
                  ]}
                  onPress={() => handleSelect(label)}
                  activeOpacity={0.75}
                >
                  <View style={[s.chipIcon, isSelected && s.chipIconSelected]}>
                    <Ionicons
                      name={icon as any}
                      size={18}
                      color={isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.accentPrimary}
                    />
                  </View>
                  <Text style={[s.chipLabel, isSelected && s.chipLabelSelected]}>
                    {label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={16} color={colors.accentPrimary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Add Button */}
          <TouchableOpacity
            style={[s.addBtn, !selectedType && s.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!selectedType}
            activeOpacity={0.8}
          >
            <Text style={[s.addBtnText, !selectedType && s.addBtnTextDisabled]}>
              {selectedType ? `Add ${selectedType}` : 'Select an activity'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 40 : 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
      alignSelf: 'center',
      marginBottom: 18,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
      paddingHorizontal: 4,
    },
    title: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 22,
      color: colors.textPrimary,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#1C1C1E' : '#E2E1EA',
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 10,
      marginBottom: 20,
    },
    chip: {
      width: '48.5%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? '#141416' : '#F5F4FA',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    chipFullWidth: {
      width: '100%',
    },
    chipSelected: {
      backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.12)',
      borderColor: colors.accentPrimary,
    },
    chipIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : 'rgba(108,92,231,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipIconSelected: {
      backgroundColor: isDark ? '#a599ff' : colors.accentPrimary,
    },
    chipLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
      color: colors.textTertiary,
      flex: 1,
    },
    chipLabelSelected: {
      color: colors.textPrimary,
    },
    addBtn: {
      backgroundColor: isDark ? '#a599ff' : colors.accentPrimary,
      borderRadius: RADIUS.lg,
      paddingVertical: 15,
      alignItems: 'center',
    },
    addBtnDisabled: {
      backgroundColor: isDark ? '#141416' : '#E2E1EA',
      borderWidth: 1,
      borderColor: colors.border,
    },
    addBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 15,
      color: isDark ? '#000000' : '#FFFFFF',
    },
    addBtnTextDisabled: {
      color: colors.textMuted,
    },
  });
