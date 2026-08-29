/**
 * AddCardioModal — ZenTrack Mobile
 * Minimalist cardio activity selector with spring animations.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, Animated, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';

// Extracted Subcomponents & Styles
import { makeCardioModalStyles } from './cardioModalStyles';
import CardioTypeSelector from './CardioTypeSelector';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (type: string) => void;
}

export function AddCardioModal({ visible, onClose, onAdd }: Props) {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeCardioModalStyles(colors, isDark), [colors, isDark]);
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
          <CardioTypeSelector
            selectedType={selectedType}
            onSelect={setSelectedType}
            styles={s}
            colors={colors}
            isDark={isDark}
          />

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

export default AddCardioModal;
