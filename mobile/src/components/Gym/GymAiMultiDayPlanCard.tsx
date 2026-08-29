import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, RADIUS, SPACE } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { MultiDayPlanEntry } from './GymAiMultiDayPlanTypes';

export interface MultiDayPlanCardProps {
  card: {
    planName?: string;
    days?: MultiDayPlanEntry[];
    onConfirm?: () => Promise<void>;
  };
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_COLORS: Record<number, string> = {
  1: '#a599ff', 2: '#7ec8e3', 3: '#f9c74f', 4: '#90be6d',
  5: '#f8961e', 6: '#e88', 7: '#aaa'
};

export const GymAiMultiDayPlanCard: React.FC<MultiDayPlanCardProps> = React.memo(({ card }) => {
  const { colors, isDark } = useTheme();
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await card.onConfirm?.();
      setConfirmed(true);
    } finally {
      setLoading(false);
    }
  };

  const days = card.days || [];
  const totalExercises = days.reduce((sum, d) => sum + (d.exercises?.length || 0), 0);

  return (
    <View style={[styles.card, { backgroundColor: isDark ? '#1C1C1E' : colors.surface, borderColor: isDark ? 'rgba(165,153,255,0.3)' : colors.accentPrimary }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="calendar" size={16} color={colors.accentPrimary} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {card.planName || 'AI Custom Split'}
          </Text>
        </View>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {days.length} days · {totalExercises} exercises
        </Text>
      </View>

      <View style={styles.daysList}>
        {days.map((day, idx) => {
          const color = DAY_COLORS[day.dayIndex] || colors.accentPrimary;
          return (
            <View key={idx} style={[styles.dayRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border }]}>
              <View style={[styles.dayBadge, { backgroundColor: `${color}20`, borderColor: color }]}>
                <Text style={[styles.dayBadgeText, { color }]}>
                  {DAY_NAMES[day.dayIndex] || `Day ${day.dayIndex}`}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dayFocus, { color: colors.textPrimary }]}>{day.focus || day.dayName}</Text>
                <Text style={[styles.dayExCount, { color: colors.textMuted }]}>
                  {day.exercises?.length || 0} exercises ({day.exercises?.map(e => e.name).slice(0, 2).join(', ')}...)
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.importBtn,
          { backgroundColor: confirmed ? '#5EDA9E' : (isDark ? '#ffffff' : colors.accentPrimary) },
          loading && { opacity: 0.6 }
        ]}
        onPress={handleConfirm}
        disabled={confirmed || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} />
        ) : confirmed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="checkmark-circle" size={16} color="#000" />
            <Text style={[styles.importBtnText, { color: '#000' }]}>Plan Imported to Routine!</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="download-outline" size={16} color={isDark ? '#000' : '#fff'} />
            <Text style={[styles.importBtnText, { color: isDark ? '#000' : '#fff' }]}>
              Import Routine to My Schedule
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1.5,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
  },
  daysList: {
    gap: 8,
    marginBottom: 14,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  dayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 42,
    alignItems: 'center',
  },
  dayBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
  },
  dayFocus: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
  },
  dayExCount: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
  },
  importBtn: {
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
  },
});

export default GymAiMultiDayPlanCard;
