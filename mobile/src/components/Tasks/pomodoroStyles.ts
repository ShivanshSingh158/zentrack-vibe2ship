import { StyleSheet, Dimensions } from 'react-native';
import { PomodoroMode } from './pomodoroTimeMath';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const RING_SIZE = 240;
export const RING_STROKE = 6.5;
export const RING_RADIUS = (RING_SIZE - RING_STROKE * 2) / 2;
export const RING_CIRCUM = RING_RADIUS * 2 * Math.PI;

export const FULLSCREEN_RING_SIZE = 340;
export const FULLSCREEN_RING_STROKE = 8;
export const FULLSCREEN_RING_RADIUS = (FULLSCREEN_RING_SIZE - FULLSCREEN_RING_STROKE * 2) / 2;
export const FULLSCREEN_RING_CIRCUM = FULLSCREEN_RING_RADIUS * 2 * Math.PI;

/**
 * Responsive Apple iOS StandBy / Focus Mode Ring Scaler
 * Proportional scale across iPads / Tablets (width >= 700) and iPhones / Android phones.
 */
export function getFullscreenRingDimensions(width: number, height: number) {
  const isWide = width >= 700;
  // Available vertical canvas space factoring in top header, task pill, mantra, and controls island
  const reservedVertical = 330;
  const availableHeight = Math.max(280, height - reservedVertical);
  const availableWidth = isWide
    ? Math.max(340, Math.min(width * 0.50, 480))
    : Math.max(280, width * 0.86);

  let size = Math.min(availableWidth, availableHeight);

  if (isWide) {
    // Commanding, luxurious circle on iPads and Tablets (380px to 440px)
    size = Math.max(380, Math.min(Math.round(size), 440));
  } else {
    // Spacious, balanced circle on mobile screens (310px to 346px)
    size = Math.max(300, Math.min(Math.round(size), 346));
  }

  const stroke = isWide ? 9 : 8;
  const radius = (size - stroke * 2) / 2;
  const circum = radius * 2 * Math.PI;

  return {
    size,
    stroke,
    radius,
    circum,
    isWide,
  };
}

export function modeLabel(mode?: PomodoroMode): string {
  return 'DEEP FOCUS';
}

export function modeIconName(mode?: PomodoroMode): any {
  return 'flame';
}

export function modeAccentDark(mode?: PomodoroMode): string {
  return '#A599FF';
}

export function modeAccentLight(mode?: PomodoroMode): string {
  return '#6C5CE7';
}

export function makeStyles(
  colors: any,
  isDark: boolean,
  accent: string,
  insets: { bottom: number; top: number },
  dimensions?: { width: number; height: number }
) {
  const windowWidth = dimensions?.width || SCREEN_WIDTH;
  const windowHeight = dimensions?.height || SCREEN_HEIGHT;
  const isWide = windowWidth >= 700;
  const isLandscape = windowWidth > windowHeight && windowWidth >= 640;

  const sheetMaxWidth = isWide ? Math.min(840, Math.round(windowWidth * 0.92)) : windowWidth;
  const sheetLeftOffset = isWide ? Math.max(0, (windowWidth - sheetMaxWidth) / 2) : 0;

  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.82)' : 'rgba(0, 0, 0, 0.45)',
    },
    sheet: {
      position: 'absolute',
      bottom: isWide ? Math.max(insets.bottom, 16) : 0,
      left: sheetLeftOffset,
      right: sheetLeftOffset,
      width: sheetMaxWidth,
      alignSelf: 'center',
      backgroundColor: isDark ? '#0A0A0E' : '#FFFFFF',
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      borderBottomLeftRadius: isWide ? 32 : 0,
      borderBottomRightRadius: isWide ? 32 : 0,
      minHeight: isWide ? 560 : 610,
      maxHeight: (isWide ? '90%' : '94%') as any,
      paddingHorizontal: isWide ? 28 : 20,
      paddingTop: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: isWide ? 0 : -10 },
      shadowOpacity: isDark ? 0.95 : 0.16,
      shadowRadius: 36,
      elevation: 36,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      borderBottomWidth: isWide ? 1 : 0,
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

    /* Apple iOS Header */
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingHorizontal: 4,
      paddingTop: 4,
    },
    headerLeft: {
      flex: 1,
      marginRight: 12,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 23,
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    headerSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12.5,
      color: colors.textMuted,
      marginTop: 2.5,
      letterSpacing: -0.1,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerActionBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F0EFF7',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : colors.border,
    },
    headerActionBtnActive: {
      backgroundColor: isDark ? 'rgba(251, 191, 36, 0.16)' : '#FEF3C7',
      borderColor: isDark ? 'rgba(251, 191, 36, 0.35)' : '#FCD34D',
    },
    sheetKeepAwakePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4.5,
      paddingHorizontal: 9,
      paddingVertical: 3.5,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F0EFF7',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
      marginLeft: 4,
    },
    sheetKeepAwakePillActive: {
      backgroundColor: isDark ? 'rgba(251, 191, 36, 0.14)' : '#FEF3C7',
      borderColor: isDark ? 'rgba(251, 191, 36, 0.32)' : '#FCD34D',
    },
    sheetKeepAwakeText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      color: colors.textMuted,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F0EFF7',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : colors.border,
    },

    /* Responsive Tablet 2-Column Split Layout */
    tabletSplitRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 28,
      paddingTop: 4,
    },
    tabletColLeft: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
    },
    tabletColRight: {
      flex: 1.15,
      paddingVertical: 4,
    },

    /* Ambient Mindful Motivation Banner — Pure Editorial Typography (No Pill, No Star) */
    mantraBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 20,
      marginVertical: 4,
      alignSelf: 'center',
      maxWidth: '92%',
    },
    mantraText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12.5,
      color: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.48)',
      fontStyle: 'italic',
      textAlign: 'center',
      letterSpacing: 0.15,
      lineHeight: 18,
    },

    /* Circular Timer Ring */
    ringContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 8,
      position: 'relative',
    },
    ringAura: {
      position: 'absolute',
      width: RING_SIZE * 0.90,
      height: RING_SIZE * 0.90,
      borderRadius: (RING_SIZE * 0.90) / 2,
    },
    ringCenterContent: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5.5,
      marginBottom: 6,
    },
    statusDot: {
      width: 5.5,
      height: 5.5,
      borderRadius: 2.75,
    },
    statusPillText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10.5,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    sheetModeTogglePill: {
      display: 'none',
    },
    sheetModeTogglePillText: {
      display: 'none',
    },
    sheetHeroRow: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    percentContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    timerDigits: {
      fontFamily: 'Inter_700Bold',
      fontSize: 48,
      letterSpacing: -1.6,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      lineHeight: 56,
      textAlign: 'center',
    },
    timerPercentSign: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 24,
      color: isDark ? '#C4B5FD' : '#6C5CE7',
      marginLeft: 3,
      marginBottom: 6,
      includeFontPadding: false,
    },
    sheetMetaContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    sheetMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5.5,
    },
    sheetLiveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#34D399',
    },
    timerMeta: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
    },

    /* Primary Controls Bar */
    controlsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      marginTop: 8,
      marginBottom: 10,
    },
    secondaryControlBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F0EFF7',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : colors.border,
    },
    primaryPlayBtn: {
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.40,
      shadowRadius: 18,
      elevation: 8,
    },

    /* Dual Quick Boost (+5m / +15m) */
    dualBoostRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginBottom: 14,
    },
    boostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4.5,
      paddingHorizontal: 15,
      paddingVertical: 6.5,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F0EFF7',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
    },
    boostBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11.5,
      color: colors.textSecondary,
    },

    /* Apple iOS Grouped Summary Card (Focus Today & Completed Sessions) */
    todaySummaryCard: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#F6F5FB',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)',
      paddingVertical: 12,
      paddingHorizontal: 18,
      marginBottom: 14,
    },
    todaySummaryGrid: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    todaySummaryTile: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    todaySummaryTileDivider: {
      width: 1,
      height: 32,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.07)',
      marginHorizontal: 12,
    },
    todaySummaryIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#EAE8F4',
      alignItems: 'center',
      justifyContent: 'center',
    },
    todaySummaryVal: {
      fontFamily: 'Inter_700Bold',
      fontSize: 17,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.3,
    },
    todaySummaryLbl: {
      fontFamily: 'Inter_500Medium',
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 2,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    /* Backwards-compatibility stubs for dailyHud */
    dailyHudCard: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#F6F5FB',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)',
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginBottom: 12,
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
      fontSize: 16,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    dailyHudLbl: {
      fontFamily: 'Inter_500Medium',
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 2.5,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    dailyHudDivider: {
      width: 1,
      height: 24,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    },

    /* Linked Task Picker */
    linkedTaskCard: {
      marginBottom: 14,
    },
    linkedTaskHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 7,
      paddingHorizontal: 2,
    },
    linkedTaskHeader: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.textTertiary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    autoCalcBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(165, 153, 255, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    autoCalcText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
    },
    linkedTaskChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#F8F7FC',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
    },
    linkedTaskTitle: {
      flex: 1,
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: colors.textMuted,
    },
    taskPickerList: {
      marginTop: 6,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
      backgroundColor: isDark ? '#101016' : '#FFFFFF',
      overflow: 'hidden',
    },
    taskPickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.05)' : colors.border,
    },
    taskPickerBullet: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : colors.border,
    },
    taskPickerLabel: {
      flex: 1,
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: colors.textSecondary,
    },
    taskDurationPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
    },
    taskDurationPillText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.textTertiary,
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
      fontSize: 11,
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
      backgroundColor: isDark ? '#191822' : '#F7F6FB',
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    depthCardActive: {
      borderColor: accent,
      borderWidth: 1.8,
      backgroundColor: isDark ? '#242138' : '#EEECFB',
      shadowColor: accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 0,
    },
    depthCardIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#EAE9F4',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
      alignSelf: 'center',
    },
    depthCardDurationText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14.5,
      color: colors.textPrimary,
      textAlign: 'center',
      letterSpacing: -0.2,
      includeFontPadding: false,
      backgroundColor: 'transparent',
    },
    depthCardTitle: {
      fontFamily: 'Inter_500Medium',
      fontSize: 10.5,
      color: colors.textMuted,
      marginTop: 2,
      textAlign: 'center',
      includeFontPadding: false,
      backgroundColor: 'transparent',
    },

    /* ═══════════════════════════════════════════════════════════════════════
       PURE APPLE iOS FULL-SCREEN IMMERSIVE STANDBY FOCUS MODE
       ═══════════════════════════════════════════════════════════════════════ */
    fullScreenContainer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#000000',
      zIndex: 9999,
      flexDirection: 'column',
      justifyContent: 'space-between',
    },
    fullScreenHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: Math.max(insets.top + 8, 20),
      zIndex: 2,
    },
    fullScreenHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    fullScreenStatusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    fullScreenStatusDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    fullScreenStatusText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10.5,
      color: '#FFFFFF',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    fullScreenKeepAwakePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    fullScreenKeepAwakePillActive: {
      backgroundColor: 'rgba(251, 191, 36, 0.18)',
      borderColor: 'rgba(251, 191, 36, 0.40)',
    },
    fullScreenKeepAwakeText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10.5,
      color: 'rgba(255, 255, 255, 0.70)',
      letterSpacing: 0.2,
    },
    fullScreenCloseBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: 'rgba(255, 255, 255, 0.09)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.15)',
    },

    /* Full Screen Linked Task Floating Banner (Apple Dynamic Island Capsule) */
    fullScreenTaskBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      gap: 9,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.15)',
      borderTopColor: 'rgba(255, 255, 255, 0.25)',
      marginTop: 14,
      maxWidth: isWide ? 620 : '88%',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
      elevation: 6,
    },
    fullScreenTaskText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13.5,
      color: '#F8FAFC',
      letterSpacing: -0.1,
    },

    /* Full Screen Central Ring & Digits */
    fullScreenCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      width: '100%',
      paddingVertical: 12,
    },
    fullScreenRingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    fullScreenRingAura: {
      position: 'absolute',
    },
    fullScreenCenterContent: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    fullScreenDigits: {
      fontFamily: 'Inter_700Bold',
      fontSize: isWide ? 76 : 64,
      letterSpacing: -2.2,
      color: '#FFFFFF',
      fontVariant: ['tabular-nums'],
      lineHeight: isWide ? 84 : 72,
      textAlign: 'center',
      includeFontPadding: false,
    },
    fullScreenPercentSign: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: isWide ? 34 : 28,
      color: '#C4B5FD',
      marginLeft: 4,
      marginBottom: 6,
      includeFontPadding: false,
    },
    fullScreenMetaContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
    },
    fullScreenMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    liveDot: {
      width: 7.5,
      height: 7.5,
      borderRadius: 4,
      backgroundColor: '#34D399',
    },
    fullScreenMetaText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: isWide ? 14 : 13,
      color: 'rgba(255, 255, 255, 0.76)',
      textAlign: 'center',
      letterSpacing: 0.3,
    },
    fullScreenMeta: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13.5,
      color: 'rgba(255, 255, 255, 0.60)',
      marginTop: 4,
      textAlign: 'center',
    },
    fullScreenMantraCard: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 28,
      marginTop: 22,
      alignSelf: 'center',
      maxWidth: isWide ? 580 : '88%',
    },
    fullScreenMantraText: {
      fontFamily: 'Inter_500Medium',
      fontSize: isWide ? 14.5 : 13.5,
      color: 'rgba(255, 255, 255, 0.46)',
      fontStyle: 'italic',
      textAlign: 'center',
      letterSpacing: 0.3,
      lineHeight: isWide ? 22 : 20,
    },
    fullScreenMantra: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: 'rgba(255, 255, 255, 0.42)',
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: 20,
      paddingHorizontal: 24,
    },

    /* Full Screen Bottom Floating Controls (Apple iOS Control Dock) */
    fullScreenControlsWrap: {
      paddingBottom: Math.max(insets.bottom + 20, 32),
      paddingHorizontal: 24,
      alignItems: 'center',
      gap: 16,
      zIndex: 2,
    },
    fullScreenControlsIsland: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: isWide ? 30 : 22,
      backgroundColor: 'rgba(255, 255, 255, 0.055)',
      paddingHorizontal: isWide ? 32 : 22,
      paddingVertical: 13,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
      borderTopColor: 'rgba(255, 255, 255, 0.22)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.50,
      shadowRadius: 28,
      elevation: 12,
    },
    fullScreenControlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
    },
    fullScreenSecondaryBtn: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnInner: {
      width: isWide ? 60 : 54,
      height: isWide ? 60 : 54,
      borderRadius: (isWide ? 60 : 54) / 2,
      backgroundColor: 'rgba(255, 255, 255, 0.09)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.18)',
      borderTopColor: 'rgba(255, 255, 255, 0.32)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
    },
    completeBtnInner: {
      backgroundColor: 'rgba(52, 211, 153, 0.10)',
      borderColor: 'rgba(52, 211, 153, 0.28)',
      borderTopColor: 'rgba(52, 211, 153, 0.48)',
      shadowColor: '#34D399',
      shadowOpacity: 0.25,
      shadowRadius: 12,
    },
    fullScreenPlayBtnOuter: {
      width: isWide ? 88 : 80,
      height: isWide ? 88 : 80,
      borderRadius: (isWide ? 88 : 80) / 2,
      padding: 4,
      backgroundColor: 'rgba(165, 153, 255, 0.22)',
      borderWidth: 1.5,
      borderColor: 'rgba(165, 153, 255, 0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#A599FF',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.55,
      shadowRadius: 24,
      elevation: 14,
    },
    fullScreenPlayBtnInner: {
      width: '100%',
      height: '100%',
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderTopColor: 'rgba(255, 255, 255, 0.55)',
      borderBottomColor: 'rgba(0, 0, 0, 0.25)',
      borderLeftColor: 'rgba(255, 255, 255, 0.30)',
      borderRightColor: 'rgba(255, 255, 255, 0.30)',
    },
    fullScreenPlayBtn: {
      width: isWide ? 84 : 78,
      height: isWide ? 84 : 78,
      borderRadius: (isWide ? 84 : 78) / 2,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.55,
      shadowRadius: 24,
      elevation: 12,
    },
    fullScreenBoostRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    fullScreenBoostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: isWide ? 18 : 15,
      paddingVertical: isWide ? 9 : 8,
      borderRadius: 999,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.15)',
      borderTopColor: 'rgba(255, 255, 255, 0.25)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
    },
    fullScreenBoostBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12.5,
      color: '#F8FAFC',
      letterSpacing: 0.2,
    },
  });
}
