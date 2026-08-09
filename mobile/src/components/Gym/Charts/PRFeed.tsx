import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../../theme/tokens';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatDateShort } from '../../../utils/dateUtils';

interface PRFeedProps {
  data: { date: Date; dateStr: string; rawWeight: number; rawReps: number; volume: number }[];
}

export default function PRFeed({ data }: PRFeedProps) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);

  const prs = useMemo(() => {
    if (!data || data.length === 0) return null;

    let maxWeight = { val: 0, date: '', reps: 0 };
    let maxVolume = { val: 0, date: '' };
    let maxReps = { val: 0, date: '', weight: 0 };

    data.forEach(d => {
      if (d.rawWeight > maxWeight.val) {
        maxWeight = { val: d.rawWeight, date: d.dateStr, reps: d.rawReps };
      }
      if (d.volume > maxVolume.val) {
        maxVolume = { val: d.volume, date: d.dateStr };
      }
      if (d.rawReps > maxReps.val) {
        maxReps = { val: d.rawReps, date: d.dateStr, weight: d.rawWeight };
      }
    });

    return { maxWeight, maxVolume, maxReps };
  }, [data]);

  if (!prs || prs.maxWeight.val === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Personal Records</Text>
      
      <View style={styles.prList}>
        <View style={styles.prItem}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(255, 159, 77, 0.15)' }]}>
            <Ionicons name="trophy" size={20} color="#ff9f4d" />
          </View>
          <View style={styles.prTextContent}>
            <Text style={styles.prLabel}>Heaviest Weight</Text>
            <Text style={styles.prDate}>{prs.maxWeight.date}</Text>
          </View>
          <Text style={styles.prValue}>{prs.maxWeight.val} kg</Text>
        </View>

        <View style={styles.prItem}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(94, 218, 158, 0.15)' }]}>
            <Ionicons name="flame" size={20} color="#5eda9e" />
          </View>
          <View style={styles.prTextContent}>
            <Text style={styles.prLabel}>Best Volume</Text>
            <Text style={styles.prDate}>{prs.maxVolume.date}</Text>
          </View>
          <Text style={styles.prValue}>{prs.maxVolume.val} kg</Text>
        </View>

        <View style={styles.prItem}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(137, 220, 235, 0.15)' }]}>
            <Ionicons name="repeat" size={20} color="#89dceb" />
          </View>
          <View style={styles.prTextContent}>
            <Text style={styles.prLabel}>Most Reps</Text>
            <Text style={styles.prDate}>{prs.maxReps.date} ({prs.maxReps.weight}kg)</Text>
          </View>
          <Text style={styles.prValue}>{prs.maxReps.val} reps</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginTop: SPACE.md,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.text,
    marginBottom: SPACE.md,
  },
  prList: {
    gap: SPACE.sm,
  },
  prItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: SPACE.sm,
    borderRadius: RADIUS.md,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACE.md,
  },
  prTextContent: {
    flex: 1,
  },
  prLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: colors.text,
  },
  prDate: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  prValue: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.text,
  },
});
