import { StyleSheet, Platform } from 'react-native';
import { FONT_FAMILY, SPACE, RADIUS, SHADOW } from '../../theme/tokens';

export const makeGymHistoryStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACE.xl,
      paddingTop: Platform.OS === 'ios' ? 10 : 20,
      paddingBottom: SPACE.md,
    },
    backBtn: { padding: SPACE.xs },
    headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary },

    content: { padding: SPACE.xl, paddingBottom: 100 },

    streakCard: {
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderRadius: RADIUS.lg,
      padding: SPACE.lg,
      marginBottom: SPACE.xl,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
      ...SHADOW.md,
    },
    streakLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
    streakBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255, 140, 0, 0.15)' : 'rgba(217, 119, 6, 0.12)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 140, 0, 0.3)' : 'rgba(217, 119, 6, 0.25)',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: RADIUS.full,
    },
    streakBadgeText: { fontFamily: FONT_FAMILY.bold, fontSize: 16 },
    streakTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },
    streakSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textMuted },

    heatmapCard: {
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderRadius: RADIUS.lg,
      padding: SPACE.lg,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
      ...SHADOW.md,
    },
    heatmapTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary, marginBottom: SPACE.xl },

    gridContainer: { flexDirection: 'row' },
    dayLabels: { justifyContent: 'space-between', marginRight: SPACE.sm, paddingVertical: 2 },
    dayLabelText: { fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textMuted, height: 16, lineHeight: 16, textAlign: 'center' },

    grid: { flexDirection: 'row', gap: 4 },
    column: { gap: 4 },
    square: { width: 16, height: 16, borderRadius: 4 },

    legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: SPACE.xl, gap: 4 },
    legendText: { fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textMuted, marginHorizontal: 4 },
    legendSquare: { width: 12, height: 12, borderRadius: 3 },
  });
