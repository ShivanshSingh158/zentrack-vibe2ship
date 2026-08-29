import { StyleSheet } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';

export const makeSwapRoutineStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      padding: SPACE.xl,
      maxHeight: '80%',
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: SPACE.lg,
    },
    title: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    subtitle: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollArea: {
      marginBottom: 16,
    },
    dayCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8f8f8',
      borderRadius: RADIUS.lg,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
    },
    dayCardActive: {
      backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
      borderColor: colors.accentPrimary,
    },
    dayCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    dayBadge: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f0f0f0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayBadgeActive: {
      backgroundColor: colors.accentPrimary,
    },
    restBadge: {
      backgroundColor: 'rgba(255,159,77,0.15)',
    },
    dayBadgeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: colors.textPrimary,
    },
    dayBadgeTextActive: {
      color: isDark ? '#000000' : '#ffffff',
    },
    dayInfo: {
      flex: 1,
    },
    dayName: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    dayNameActive: {
      color: colors.accentPrimary,
    },
    daySubtitle: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    dayCardRight: {
      marginLeft: 8,
    },
    activeCheckPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.accentPrimary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    activeCheckText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: isDark ? '#000000' : '#ffffff',
    },
  });
