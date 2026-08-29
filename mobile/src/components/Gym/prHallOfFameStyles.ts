import { StyleSheet } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';

export const makePRHallOfFameStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    title: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.xl,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    subtitle: {
      fontFamily: FONT_FAMILY.body,
      fontSize: FONT_SIZE.sm,
      color: colors.textMuted,
      marginBottom: SPACE.lg,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: SPACE.xxl,
      gap: SPACE.sm,
    },
    emptyText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.base,
      color: colors.textSecondary,
    },
    emptyHint: {
      fontFamily: FONT_FAMILY.body,
      fontSize: FONT_SIZE.sm,
      color: colors.textMuted,
      textAlign: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.md,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      padding: SPACE.md,
    },
    rankBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: '#f59e0b',
    },
    rowBody: {
      flex: 1,
      gap: 4,
    },
    exerciseName: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.sm,
    },
    rowDetails: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: RADIUS.full,
    },
    chip1RM: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: '#f59e0b',
    },
    detail: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 11,
    },
    date: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 11,
    },
  });
