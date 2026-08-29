import { StyleSheet, Platform, Dimensions } from 'react-native';
import { FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';

const { height: SCREEN_H } = Dimensions.get('window');

export const makeCardioModalStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      paddingHorizontal: SPACE.lg,
      paddingTop: 12,
      paddingBottom: Platform.OS === 'ios' ? 36 : 20,
      borderTopWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
      maxHeight: SCREEN_H * 0.78,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
      alignSelf: 'center',
      marginBottom: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    headerLeft: {
      flex: 1,
    },
    title: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    subtitle: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 2,
    },
    closeBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 20,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: RADIUS.lg,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8f8f8',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
      width: '48%',
    },
    chipFullWidth: {
      width: '100%',
    },
    chipSelected: {
      backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.1)',
      borderColor: colors.accentPrimary,
    },
    chipIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#efefef',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipIconSelected: {
      backgroundColor: colors.accentPrimary,
    },
    chipLabel: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 13,
      color: colors.textPrimary,
      flex: 1,
    },
    chipLabelSelected: {
      fontFamily: FONT_FAMILY.bold,
      color: colors.accentPrimary,
    },
    row: {
      flexDirection: 'row',
      marginBottom: 10,
    },
    fieldBox: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F4FA',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
      padding: 12,
    },
    fieldHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginBottom: 8,
    },
    fieldIconBox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fieldLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: colors.textTertiary,
      flex: 1,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    fieldUnit: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 9,
      color: colors.textMuted,
    },
    input: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 20,
      color: colors.textPrimary,
      padding: 0,
      height: 28,
    },
    saveBtn: {
      backgroundColor: isDark ? '#ffffff' : colors.accentPrimary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 10,
    },
    saveBtnDisabled: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E1EA',
      borderWidth: 1,
      borderColor: colors.border,
    },
    saveBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: isDark ? '#000000' : '#FFFFFF',
    },
    saveBtnTextDisabled: {
      color: colors.textMuted,
    },
    addBtn: {
      backgroundColor: isDark ? '#ffffff' : colors.accentPrimary,
      borderRadius: RADIUS.lg,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnDisabled: {
      opacity: 0.4,
    },
    addBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: isDark ? '#000000' : '#ffffff',
    },
    addBtnTextDisabled: {
      color: colors.textMuted,
    },
  });
