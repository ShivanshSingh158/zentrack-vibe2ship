/**
 * CardioCard — ZenTrack Mobile
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';
import { GymCardioLog } from '../../types/gym.types';
import { triggerLayoutAnimation } from '../../theme/animations';

interface Props {
  cardio: GymCardioLog;
  onUpdate: (id: string, updates: Partial<GymCardioLog>) => void;
}

export function CardioCard({ cardio, onUpdate }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    triggerLayoutAnimation();
    setIsExpanded(!isExpanded);
  };

  const handleMinsChange = (text: string) => {
    const val = parseInt(text, 10);
    onUpdate(cardio.id, { durationMinutes: isNaN(val) ? null : val });
  };

  const handleKmChange = (text: string) => {
    const val = parseFloat(text);
    onUpdate(cardio.id, { distanceKm: isNaN(val) ? null : val });
  };

  return (
    <View style={styles.cardContainer}>
      <TouchableOpacity style={styles.header} onPress={toggleExpand} activeOpacity={0.8}>
        <View style={[styles.iconContainer, cardio.completed && { backgroundColor: 'rgba(196, 144, 255, 0.1)' }]}>
          <Ionicons 
            name={cardio.type.toLowerCase().includes('run') || cardio.type === 'Treadmill' ? "walk" : "bicycle"} 
            size={14} 
            color={cardio.completed ? '#C490FF' : COLORS.textMuted} 
          />
        </View>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>{cardio.type}</Text>
          <Text style={styles.subtitle}>{cardio.completed ? 'Completed' : 'Tap to log'}</Text>
        </View>
        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={COLORS.textMuted} />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.expandedContent}>
          
          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <Ionicons name="time-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.inputLabel}>MINS</Text>
            </View>
            <View style={styles.inputBox}>
              <TextInput 
                style={styles.input} 
                keyboardType="numeric" 
                placeholder="—" 
                placeholderTextColor={COLORS.textMuted}
                value={cardio.durationMinutes ? cardio.durationMinutes.toString() : ''}
                onChangeText={handleMinsChange}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <Ionicons name="flash-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.inputLabel}>KM</Text>
            </View>
            <View style={styles.inputBox}>
              <TextInput 
                style={styles.input} 
                keyboardType="numeric" 
                placeholder="—" 
                placeholderTextColor={COLORS.textMuted}
                value={cardio.distanceKm ? cardio.distanceKm.toString() : ''}
                onChangeText={handleKmChange}
              />
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.doneBtn, cardio.completed && styles.doneBtnActive]}
            onPress={() => onUpdate(cardio.id, { completed: !cardio.completed })}
          >
            <Ionicons name="checkmark" size={16} color={cardio.completed ? COLORS.textPrimary : COLORS.textPrimary} />
            <Text style={styles.doneBtnText}>{cardio.completed ? 'Completed' : 'Mark as Done'}</Text>
          </TouchableOpacity>

        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: SPACE.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACE.sm,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  expandedContent: {
    paddingVertical: SPACE.md,
    paddingLeft: 40, // align with text
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
    backgroundColor: '#1C1C1E',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  inputLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  inputBox: {
    width: 80,
  },
  input: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: COLORS.textPrimary,
    textAlign: 'right',
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
    gap: SPACE.xs,
    marginTop: SPACE.xs,
  },
  doneBtnActive: {
    backgroundColor: 'rgba(196, 144, 255, 0.1)',
    borderColor: '#C490FF',
  },
  doneBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
});
