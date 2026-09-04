import { StyleSheet } from 'react-native';
import { PomodoroMode } from './pomodoroTimeMath';

export const RING_SIZE = 260;
export const RING_STROKE = 5.5;
export const RING_RADIUS = (RING_SIZE - RING_STROKE * 2) / 2;
export const RING_CIRCUM = RING_RADIUS * 2 * Math.PI;

export function modeLabel(mode: PomodoroMode): string {
  if (mode === 'focus') return 'DEEP FLOW';
  if (mode === 'shortBreak') return 'ZEN RECHARGE';
  return 'DEEP REST';
}

export function modeIconName(mode: PomodoroMode): any {
  if (mode === 'focus') return 'flame';
  if (mode === 'shortBreak') return 'leaf';
  return 'moon';
}

export function modeAccentDark(mode: PomodoroMode): string {
  if (mode === 'focus') return '#a599ff';
  if (mode === 'shortBreak') return '#34d399';
  return '#38bdf8';
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
      backgroundColor: 'rgba(0, 0, 0, 0.82)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: isDark ? '#08080b' : '#FFFFFF',
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      minHeight: 640,
      maxHeight: '96%' as any,
      paddingHorizontal: 20,
      paddingTop: 10,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: isDark ? 0.9 : 0.15,
      shadowRadius: 28,
      elevation: 28,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      borderBottomWidth: 0,
    },
    handleWrap: {
      alignItems: 'center',
      paddingVertical: 6,
    },
    handle: {
      width: 40,
      height: 4.5,
      borderRadius: 3,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(0, 0, 0, 0.14)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    headerTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 22,
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    headerSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? '#14141a' : '#F0EFF7',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#22222a' : colors.border,
    },

    /* Best-in-Class Mode Switcher: Deep Focus vs Zen Recharge */
    modeSwitcherCapsule: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#0f0f15' : '#F0EFF7',
      borderRadius: 16,
      padding: 4,
      borderWidth: 1,
      borderColor: isDark ? '#1c1c28' : colors.border,
      marginBottom: 14,
    },
    modeSwitcherTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 12,
      gap: 6,
    },
    modeSwitcherTabActive: {
      backgroundColor: isDark ? '#1a1a24' : '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    modeSwitcherText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12.5,
      color: colors.textMuted,
    },

    /* Legacy Segmented Capsule (Backwards compatibility) */
    segmentedCapsule: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#0f0f14' : '#F0EFF7',
      borderRadius: 16,
      padding: 4,
      borderWidth: 1,
      borderColor: isDark ? '#1a1a24' : colors.border,
      marginBottom: 18,
    },
    segmentedTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 12,
    },
    segmentedTabActive: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.09)' : '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
      elevation: 3,
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
      marginVertical: 6,
      position: 'relative',
    },
    ringAura: {
      position: 'absolute',
      width: RING_SIZE * 0.85,
      height: RING_SIZE * 0.85,
      borderRadius: (RING_SIZE * 0.85) / 2,
    },
    ringCenterContent: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? '#0d0d12' : '#F4F3F8',
      paddingHorizontal: 10,
      paddingVertical: 3.5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? '#1e1e28' : colors.border,
      marginBottom: 6,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusPillText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9.5,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    timerDigits: {
      fontFamily: 'Inter_700Bold',
      fontSize: 50,
      letterSpacing: -2,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      lineHeight: 58,
    },
    timerMeta: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
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
      gap: 7,
      marginBottom: 6,
    },
    pipCapsule: {
      width: 32,
      height: 5,
      borderRadius: 3,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    },
    pipsSubtext: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      color: colors.textTertiary,
    },

    /* Controls Bar */
    controlsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 26,
      marginBottom: 8,
    },
    secondaryControlBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? '#111116' : '#F0EFF7',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#1f1f2a' : colors.border,
    },
    primaryPlayBtn: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.5,
      shadowRadius: 18,
      elevation: 10,
    },

    /* Quick Boost +5m */
    quickBoostRow: {
      alignItems: 'center',
      marginBottom: 16,
    },
    quickBoostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: isDark ? '#0f0f14' : '#F0EFF7',
      borderWidth: 1,
      borderColor: isDark ? '#1e1e28' : colors.border,
    },
    quickBoostText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11.5,
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
      paddingHorizontal: 7,
      paddingVertical: 2.5,
      borderRadius: 6,
    },
    autoCalcText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
    },
    linkedTaskChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 15,
      paddingVertical: 11,
      borderRadius: 14,
      backgroundColor: isDark ? '#0c0c10' : '#F8F7FC',
      borderWidth: 1,
      borderColor: isDark ? '#1a1a24' : colors.border,
    },
    linkedTaskTitle: {
      flex: 1,
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: colors.textMuted,
    },
    taskPickerList: {
      marginTop: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? '#1e1e28' : colors.border,
      backgroundColor: isDark ? '#0a0a0e' : '#FFFFFF',
      overflow: 'hidden',
    },
    taskPickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 11,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#14141c' : colors.border,
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

    /* Daily Performance HUD Bar */
    dailyHudCard: {
      backgroundColor: isDark ? '#0d0d12' : '#F4F3F8',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? '#1a1a24' : colors.border,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginTop: 10,
      marginBottom: 16,
    },
    dailyHudRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
    },
    dailyHudItem: {
      alignItems: 'center',
      flex: 1,
    },
    dailyHudVal: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    dailyHudLbl: {
      fontFamily: 'Inter_500Medium',
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 2,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    dailyHudDivider: {
      width: 1,
      height: 22,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    },

    /* Mindful Focus Mantra */
    mantraBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: 12,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
    },
    mantraText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11.5,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },

    /* Dual Quick Boost (+5m / +15m) */
    dualBoostRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginBottom: 16,
    },
    boostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 13,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: isDark ? '#101017' : '#F0EFF7',
      borderWidth: 1,
      borderColor: isDark ? '#1e1e2c' : colors.border,
    },
    boostBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11.5,
      color: colors.textSecondary,
    },

    /* Focus Depths Section (Sprint, Classic, Deep, Flow) */
    focusDepthSection: {
      marginBottom: 16,
    },
    focusDepthHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    focusDepthTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10.5,
      color: colors.textTertiary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    focusDepthBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    focusDepthBadgeText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 10.5,
      color: colors.textMuted,
    },
    depthGrid: {
      flexDirection: 'row',
      gap: 8,
    },
    depthCard: {
      flex: 1,
      backgroundColor: isDark ? '#0b0b10' : '#F7F6FB',
      borderRadius: 16,
      padding: 10,
      borderWidth: 1.5,
      borderColor: isDark ? '#171722' : colors.border,
      alignItems: 'center',
      position: 'relative',
    },
    depthCardActive: {
      borderColor: accent,
      backgroundColor: isDark ? 'rgba(165, 153, 255, 0.08)' : 'rgba(108, 92, 231, 0.06)',
      shadowColor: accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    depthCardIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? '#161622' : '#ECEBF5',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    depthCardDurationText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 13.5,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    depthCardTitle: {
      fontFamily: 'Inter_500Medium',
      fontSize: 10.5,
      color: colors.textMuted,
      marginTop: 2,
      textAlign: 'center',
    },

    /* Zen Recharge Section */
    rechargeCard: {
      backgroundColor: isDark ? '#091510' : '#F0FDF4',
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? '#164e37' : '#BBF7D0',
      marginBottom: 16,
      alignItems: 'center',
    },
    rechargeTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
      color: '#34D399',
      marginBottom: 4,
    },
    rechargeDesc: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 17,
    },

    /* Presets Grid */
    presetsGrid: {
      flexDirection: 'row',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? '#1a1a24' : colors.border,
      backgroundColor: isDark ? '#0a0a0e' : '#F8F7FC',
      overflow: 'hidden',
    },
    presetItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 13,
    },
    presetItemActive: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FFFFFF',
    },
    presetValue: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15.5,
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
      backgroundColor: isDark ? '#1a1a24' : colors.border,
      marginVertical: 8,
    },
  });
}
