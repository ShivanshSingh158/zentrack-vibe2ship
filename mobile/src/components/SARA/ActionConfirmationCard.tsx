import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';

interface ActionConfirmationCardProps {
  actionType: 'task' | 'calendar' | 'gym' | 'note';
  title: string;
  details: string;
  onConfirm: () => void;
  onEdit?: () => void;
}

export default function ActionConfirmationCard({ 
  actionType, 
  title, 
  details, 
  onConfirm, 
  onEdit 
}: ActionConfirmationCardProps) {
  const [confirmed, setConfirmed] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // Micro-animation collapsing into a checkmark
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(() => {
      setConfirmed(true);
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 40,
        friction: 5,
        useNativeDriver: true,
      }).start();
      onConfirm();
    });
  };

  const getIcon = () => {
    switch(actionType) {
      case 'task': return 'checkmark-circle-outline';
      case 'calendar': return 'calendar-outline';
      case 'gym': return 'barbell-outline';
      case 'note': return 'document-text-outline';
      default: return 'flash-outline';
    }
  };

  if (confirmed) {
    return (
      <Animated.View style={[styles.confirmedContainer, { transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name="checkmark" size={20} color={COLORS.accentGreen} />
        <Text style={styles.confirmedText}>Confirmed</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
      <Animated.View style={{ opacity: fadeAnim }}>
        <View style={styles.header}>
          <Ionicons name={getIcon()} size={20} color={COLORS.accentBlue} />
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        <Text style={styles.details}>{details}</Text>
        
        <View style={styles.actions}>
          <TouchableOpacity 
            style={styles.confirmBtn} 
            activeOpacity={0.8} 
            onPress={handleConfirm}
          >
            <Text style={styles.confirmBtnText}>Confirm</Text>
          </TouchableOpacity>
          
          {onEdit && (
            <TouchableOpacity 
              style={styles.editBtn} 
              activeOpacity={0.8} 
              onPress={() => {
                Haptics.selectionAsync();
                onEdit();
              }}
            >
              <Text style={styles.editBtnText}>Edit time</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginVertical: SPACE.sm,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.xs,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    flex: 1,
  },
  details: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginBottom: SPACE.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACE.md,
  },
  confirmBtn: {
    backgroundColor: COLORS.textPrimary,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.sm,
  },
  confirmBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.background,
  },
  editBtn: {
    backgroundColor: 'transparent',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
  },
  confirmedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: 'rgba(166, 227, 161, 0.1)', // accentGreenDim
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(166, 227, 161, 0.2)',
    alignSelf: 'flex-start',
    marginVertical: SPACE.sm,
  },
  confirmedText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.accentGreen,
  }
});
