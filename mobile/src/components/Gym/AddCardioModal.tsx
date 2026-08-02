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
  const { colors } = useTheme();
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
            {CARDIO_TYPES.map(({ label, icon }, index) => {
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
                  activeOpacity={0.7}
                >
                  <View style={[s.chipIcon, isSelected && s.chipIconSelected]}>
                    <Ionicons
                      name={icon as any}
                      size={18}
                      color={isSelected ? '#000000' : '#a599ff'}
                    />
                  </View>
                  <Text style={[s.chipLabel, isSelected && s.chipLabelSelected]} numberOfLines={1}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[s.addBtn, !selectedType && s.addBtnDisabled]}
            disabled={!selectedType}
            onPress={handleAdd}
            activeOpacity={0.85}
          >
            <Text style={[s.addBtnText, !selectedType && s.addBtnTextDisabled]}>
              {selectedType ? `Add ${selectedType}` : 'Select a type above'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const ACCENT = '#a599ff'; // ZenTrack purple accent

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#000000',
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
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
    color: '#ffffff',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
    backgroundColor: '#141416',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  chipFullWidth: {
    width: '100%',
  },
  chipSelected: {
    backgroundColor: 'rgba(165,153,255,0.12)',
    borderColor: 'rgba(165,153,255,0.4)',
  },
  chipIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(165,153,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipIconSelected: {
    backgroundColor: ACCENT,
  },
  chipLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: '#8E8E93',
    flex: 1,
  },
  chipLabelSelected: {
    color: '#ffffff',
  },
  addBtn: {
    backgroundColor: ACCENT,
    borderRadius: RADIUS.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },
  addBtnDisabled: {
    backgroundColor: '#141416',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  addBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: '#000000',
  },
  addBtnTextDisabled: {
    color: '#636366',
  },
});

