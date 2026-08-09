import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../../theme/tokens';
import { useTheme } from '../../../contexts/ThemeContext';

interface StrengthTierProps {
  maxWeight: number;
  bodyWeight?: number; // fallback to 75kg
}

export default function StrengthTier({ maxWeight, bodyWeight = 75 }: StrengthTierProps) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);

  const { tier, title, nextGoal, color } = useMemo(() => {
    if (maxWeight === 0) return { tier: 0, title: 'Unranked', nextGoal: 0, color: '#636366' };

    const ratio = maxWeight / bodyWeight;
    
    // Generic multiplier for Gamification
    if (ratio < 0.5) return { tier: 1, title: 'Novice', nextGoal: bodyWeight * 0.5, color: '#636366' };
    if (ratio < 0.8) return { tier: 2, title: 'Beginner', nextGoal: bodyWeight * 0.8, color: '#5eda9e' };
    if (ratio < 1.2) return { tier: 3, title: 'Intermediate', nextGoal: bodyWeight * 1.2, color: '#89dceb' };
    if (ratio < 1.5) return { tier: 4, title: 'Advanced', nextGoal: bodyWeight * 1.5, color: '#a599ff' };
    return { tier: 5, title: 'Elite', nextGoal: bodyWeight * 2.0, color: '#ff9f4d' };
  }, [maxWeight, bodyWeight]);

  if (maxWeight === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="shield-half" size={24} color={color} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.titleText}>Strength Tier</Text>
          <Text style={[styles.tierText, { color }]}>{title} Lifter</Text>
        </View>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>Lv {tier}</Text>
        </View>
      </View>
      
      {nextGoal > maxWeight && (
        <View style={styles.progressSection}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: \`\${Math.min(100, (maxWeight / nextGoal) * 100)}%\`, backgroundColor: color }]} />
          </View>
          <Text style={styles.progressText}>
            {maxWeight}kg / {Math.round(nextGoal)}kg to Next Rank
          </Text>
        </View>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACE.md,
  },
  textContainer: {
    flex: 1,
  },
  titleText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.xs,
    color: colors.textSecondary,
  },
  tierText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
  },
  levelBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
  },
  levelBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: colors.text,
  },
  progressSection: {
    marginTop: SPACE.md,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'right',
  },
});
