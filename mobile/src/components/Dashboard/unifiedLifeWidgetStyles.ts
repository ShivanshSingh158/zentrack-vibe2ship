/**
 * unifiedLifeWidgetStyles.ts — ZenTrack Mobile
 *
 * Extracted stylesheet factory for UnifiedLifeWidget.
 */
import { StyleSheet } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';

export const RING_SIZE = 124;
export const RING_STROKE = 9.5;
export const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    card: {
      backgroundColor: isDark ? '#101012' : colors.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border || '#2c2c2e',
      paddingHorizontal: SPACE.md,
      paddingTop: 14,
      paddingBottom: 12,
      marginTop: 4,
      gap: 8,
    },
    pillsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
    },
    streakPill: {
      backgroundColor: colors.accentAmberDim,
      borderColor: colors.accentAmber + '35',
    },
    levelPill: {
      backgroundColor: colors.accentDim,
      borderColor: colors.accentPrimary + '35',
    },
    pillIcon: { fontSize: 12 },
    pillText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      letterSpacing: 0.2,
    },
    streakPillText: { color: colors.accentAmber },
    levelPillText: { color: colors.accentPrimary },
    mainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 16,
      marginVertical: SPACE.xs,
    },
    verticalDivider: {
      width: 1,
      height: '100%',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
    },
    rightMetricsColumn: {
      flex: 1,
      justifyContent: 'center',
      gap: 6,
    },
    compactMetricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    compactLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    compactBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactEmoji: { fontSize: 13 },
    compactLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
      color: colors.textPrimary || '#ffffff',
    },
    valuePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    valuePillText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      letterSpacing: 0.5,
    },
    ringWrapper: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    svgAbsolute: {
      position: 'absolute',
      top: 0,
      left: 0,
    },
    ringCenter: {
      position: 'absolute',
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringCenterInner: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
    },
    ringCount: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 26,
      color: colors.textPrimary,
      lineHeight: 30,
    },
    ringLabel: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 9,
      color: colors.textTertiary,
      letterSpacing: 1,
      marginTop: 2,
    },
    ringTimeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    ringClassTitle: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 9,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      textAlign: 'center',
      paddingHorizontal: 12,
    },
    xpSection: {
      gap: 5,
      marginTop: 2,
    },
    xpLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    xpLevelText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9,
      color: colors.textTertiary || '#8e8e93',
      letterSpacing: 0.3,
    },
    xpToNext: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9,
      color: colors.textTertiary || '#8e8e93',
      letterSpacing: 0.3,
    },
    xpTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    xpFill: {
      height: '100%',
      borderRadius: 3,
    },
    captureBar: {
      marginTop: SPACE.md,
      marginBottom: SPACE.xs,
      backgroundColor: colors.surface2 || colors.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.md,
      gap: SPACE.sm,
    },
    capturePlaceholder: {
      flex: 1,
      fontFamily: FONT_FAMILY.body,
      fontSize: FONT_SIZE.md,
      color: colors.textTertiary,
    },
    urgentBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACE.md,
      backgroundColor: colors.accentAmberDim,
      borderWidth: 1,
      borderColor: colors.accentAmber + '40',
      borderRadius: RADIUS.lg,
      padding: SPACE.lg,
    },
    urgentTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.accentAmber, letterSpacing: 0.5, marginBottom: 4 },
    urgentItem:  { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textSecondary, lineHeight: 18 },
  });
