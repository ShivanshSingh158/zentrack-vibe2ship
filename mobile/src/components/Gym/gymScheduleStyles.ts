import { StyleSheet } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';

export const makeGymScheduleStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    card: {
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      height: '88%',
      maxHeight: '92%',
      borderTopWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.md,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
    },
    title: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    closeBtn: {
      padding: 4,
    },
    tabsContainer: {
      flexDirection: 'row',
      paddingHorizontal: SPACE.lg,
      paddingVertical: 10,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: RADIUS.md,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f5f5f5',
    },
    tabBtnActive: {
      backgroundColor: isDark ? 'rgba(165,153,255,0.18)' : 'rgba(108,92,231,0.12)',
      borderWidth: 1,
      borderColor: colors.accentPrimary,
    },
    tabText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 13,
      color: colors.textMuted,
    },
    tabTextActive: {
      fontFamily: FONT_FAMILY.bold,
      color: colors.accentPrimary,
    },
    contentContainer: {
      paddingHorizontal: SPACE.lg,
      paddingTop: SPACE.md,
      paddingBottom: 32,
    },
    description: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
      marginBottom: 14,
    },
    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8f8f8',
      borderRadius: RADIUS.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    dayRowRest: {
      opacity: 0.85,
      borderColor: 'rgba(255,159,77,0.2)',
    },
    dayInfo: {
      flex: 1,
    },
    dayName: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    dayNameRest: {
      color: '#ff9f4d',
    },
    planFocus: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    planFocusRest: {
      color: '#ff9f4d',
    },
    timeBlock: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    timeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: colors.textPrimary,
      textAlign: 'right',
    },
    timeSubText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10,
      color: colors.textMuted,
      textAlign: 'right',
    },
    notSetText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
      color: colors.textTertiary,
    },
    saveBtn: {
      backgroundColor: isDark ? '#ffffff' : colors.accentPrimary,
      borderRadius: RADIUS.lg,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    saveBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: isDark ? '#000000' : '#ffffff',
    },
    editContainer: {
      paddingBottom: 24,
    },
    editHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
    },
    settingLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    settingSub: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
