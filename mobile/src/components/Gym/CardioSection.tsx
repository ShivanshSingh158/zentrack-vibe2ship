/**
 * CardioSection.tsx
 * Renders the cardio log section for a workout day.
 * Extracted from GymHomeScreen.tsx renderCardio().
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '../../theme/tokens';
import { gymHomeStyles as s } from '../../screens/gym/home/gymHomeStyles';
import { hapticMedium } from '../../utils/haptics';
import { GymCardioLog } from '../../types/gym.types';

interface CardioSectionProps {
  log: any;
  animList: Animated.Value;
  onLogCardio: (c: GymCardioLog) => void;
  onAddCardio: () => void;
  onDeleteCardio: (id: string) => void;
}

export const CardioSection = memo(function CardioSection({ log, animList, onLogCardio, onAddCardio, onDeleteCardio }: CardioSectionProps) {
  const cardioItems = log?.cardio || [];

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>CARDIO</Text>

      {cardioItems.map((c: GymCardioLog) => {
        const isDone = c.completed;
        return (
          <Animated.View key={c.id} style={{ opacity: animList, transform: [{ translateY: animList.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
            <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => onLogCardio(c)}>
              <View style={s.cardioSquare}>
                {isDone
                  ? <Ionicons name="checkmark" size={18} color={COLORS.background} />
                  : <Ionicons name="fitness-outline" size={18} color={COLORS.textMuted} />
                }
              </View>
              <View style={s.rowTextCol}>
                <Text style={[s.rowTitle, isDone && s.textStrikethrough]}>{c.type || 'Cardio'}</Text>
                <Text style={s.rowSubtitle}>
                  {c.durationMinutes ? `${c.durationMinutes} min` : '0 min'}
                  {c.distanceKm  ? ` • ${c.distanceKm} km`        : ''}
                  {c.speedKmh    ? ` • ${c.speedKmh} km/h`        : ''}
                  {c.incline     ? ` • ${c.incline}% incline`     : ''}
                  {c.floors      ? ` • ${c.floors} floors`        : ''}
                  {c.level       ? ` • Lvl ${c.level}`            : ''}
                  {c.laps        ? ` • ${c.laps} laps`            : ''}
                  {c.rounds      ? ` • ${c.rounds} rounds`        : ''}
                  {c.spm         ? ` • ${c.spm} spm`              : ''}
                  {c.pace        ? ` • ${c.pace} min/km`          : ''}
                </Text>
              </View>
              <View style={s.rowActions}>
                <TouchableOpacity
                  style={s.actionBtn}
                  onPress={() => {
                    hapticMedium();
                    Alert.alert(c.type || 'Cardio', 'What would you like to do?', [
                      { text: 'Log / Edit',  onPress: () => onLogCardio(c) },
                      { text: 'Delete', style: 'destructive', onPress: () => onDeleteCardio(c.id) },
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  }}
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Animated.View>
        );
      })}

      {/* Add Cardio pill */}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginTop: 4 }}
        activeOpacity={0.7}
        onPress={onAddCardio}
      >
        <Ionicons name="add" size={14} color={COLORS.textMuted} />
        <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 12, color: COLORS.textMuted }}>Add Cardio</Text>
      </TouchableOpacity>
    </View>
  );
});
CardioSection.displayName = 'CardioSection';
