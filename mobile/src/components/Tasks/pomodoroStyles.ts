import { StyleSheet } from 'react-native';
import { PomodoroMode } from './pomodoroTimeMath';

export const RING_SIZE = 256;
export const RING_STROKE = 4.5;
export const RING_RADIUS = (RING_SIZE - RING_STROKE * 2) / 2;
export const RING_CIRCUM = RING_RADIUS * 2 * Math.PI;

export function modeLabel(mode: PomodoroMode): string {
  if (mode === 'focus') return 'FOCUS';
  if (mode === 'shortBreak') return 'SHORT BREAK';
  return 'LONG BREAK';
}

export function modeIconName(mode: PomodoroMode): any {
  if (mode === 'focus') return 'flame';
  if (mode === 'shortBreak') return 'cafe';
  return 'moon';
}

export function modeAccentDark(mode: PomodoroMode): string {
  if (mode === 'focus') return '#a599ff';
  if (mode === 'shortBreak') return '#5eda9e';
  return '#89dceb';
}

export function modeAccentLight(mode: PomodoroMode): string {
  if (mode === 'focus') return '#6C5CE7';
  if (mode === 'shortBreak') return '#059669';
  return '#0284C7';
}

export function makeStyles(colors: any, isDark: boolean, accent: string, insets: { bottom: number; top: number }) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.78)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      minHeight: 610,
      maxHeight: '94%' as any,
      paddingHorizontal: 20,
      paddingTop: 10,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: isDark ? 0.8 : 0.15,
      shadowRadius: 24,
      elevation: 28,
      borderWidth: 1,
      borderColor: isDark ? '#1c1c20' : colors.border,
      borderBottomWidth: 0,
    },
    handleWrap: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.15)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      paddingHorizontal: 4,
    },
    headerTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 22,
      color: colors.textPrimary,
      letterSpacing: -0.4,
    },
    headerSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12.5,
      color: colors.textMuted,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#121216' : '#F0EFF7',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#1f1f26' : colors.border,
    },

    /* Segmented Mode Selector */
    segmentedCapsule: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#0a0a0d' : '#F0EFF7',
      borderRadius: 14,
      padding: 3,
      borderWidth: 1,
      borderColor: isDark ? '#18181e' : colors.border,
      marginBottom: 20,
    },
    segmentedTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 11,
    },
    segmentedTabActive: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 2,
    },
    segmentedTabText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12.5,
      color: colors.textMuted,
    },

    /* Ring & Center */
    ringContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 4,
      position: 'relative',
    },
    ringAura: {
      position: 'absolute',
      width: RING_SIZE * 0.76,
      height: RING_SIZE * 0.76,
      borderRadius: (RING_SIZE * 0.76) / 2,
    },
    ringCenterContent: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? '#0c0c10' : '#F4F3F8',
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? '#1a1a22' : colors.border,
      marginBottom: 6,
    },
    statusDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    statusPillText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9.5,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    timerDigits: {
      fontFamily: 'Inter_700Bold',
      fontSize: 48,
      letterSpacing: -1.5,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      lineHeight: 56,
    },
    timerMeta: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11.5,
      color: colors.textMuted,
      marginTop: 2,
    },

    /* Pips / Cycle Progress */
    pipsSection: {
      alignItems: 'center',
      marginTop: 14,
      marginBottom: 18,
    },
    pipsRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 6,
    },
    pipCapsule: {
      width: 28,
      height: 4.5,
      borderRadius: 2.5,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    },
    pipsSubtext: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.textTertiary,
    },

    /* Controls Bar */
    controlsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      marginBottom: 8,
    },
    secondaryControlBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: isDark ? '#0e0e12' : '#F0EFF7',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#1c1c22' : colors.border,
    },
    primaryPlayBtn: {
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 16,
      elevation: 8,
    },

    /* Quick Boost +5m */
    quickBoostRow: {
      alignItems: 'center',
      marginBottom: 18,
    },
    quickBoostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: isDark ? '#0c0c0f' : '#F0EFF7',
      borderWidth: 1,
      borderColor: isDark ? '#1a1a20' : colors.border,
    },
    quickBoostText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      color: colors.textSecondary,
    },

    /* Linked Task */
    linkedTaskCard: {
      marginBottom: 14,
    },
    linkedTaskHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
      paddingHorizontal: 2,
    },
    linkedTaskHeader: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10.5,
      color: colors.textTertiary,
      letterSpacing: 0.8,
    },
    autoCalcBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(165,153,255,0.12)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    autoCalcText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
    },
    linkedTaskChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: isDark ? '#09090c' : '#F8F7FC',
      borderWidth: 1,
      borderColor: isDark ? '#18181e' : colors.border,
    },
    linkedTaskTitle: {
      flex: 1,
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: colors.textMuted,
    },
    taskPickerList: {
      marginTop: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#1c1c22' : colors.border,
      backgroundColor: isDark ? '#08080a' : '#FFFFFF',
      overflow: 'hidden',
    },
    taskPickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#141418' : colors.border,
    },
    taskPickerBullet: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : colors.border,
    },
    taskPickerLabel: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
    },
    taskDurationPill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    },
    taskDurationPillText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10.5,
      color: colors.textTertiary,
    },

    /* Presets Grid */
    presetsGrid: {
      flexDirection: 'row',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? '#18181e' : colors.border,
      backgroundColor: isDark ? '#08080b' : '#F8F7FC',
      overflow: 'hidden',
    },
    presetItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
    },
    presetItemActive: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#FFFFFF',
    },
    presetValue: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: colors.textPrimary,
    },
    presetLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10.5,
      color: colors.textMuted,
      marginTop: 2,
    },
    presetDivider: {
      width: 1,
      backgroundColor: isDark ? '#18181e' : colors.border,
      marginVertical: 8,
    },
  });
}
