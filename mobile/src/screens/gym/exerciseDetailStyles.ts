import { StyleSheet, Platform } from 'react-native';
import { FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';

export const makeExerciseDetailStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACE.xl,
      paddingTop: Platform.OS === 'ios' ? 10 : 20,
      paddingBottom: SPACE.md,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    backBtn: { padding: SPACE.xs },
    headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },
    saveBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.12)',
      borderRadius: RADIUS.sm,
    },
    saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.accentPrimary },

    scrollContent: { padding: SPACE.xl, paddingBottom: 100 },

    previewHeader: { alignItems: 'center', marginBottom: SPACE.lg },
    musclePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    muscleDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
    muscleText: { fontFamily: FONT_FAMILY.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
    formGroup: { marginBottom: SPACE.lg },
    dropdown: {
      position: 'absolute',
      top: 60,
      left: 0,
      right: 0,
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
      zIndex: 999,
      elevation: 5,
      maxHeight: 180,
    },
    dropdownItem: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    dropdownText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontFamily: FONT_FAMILY.medium,
    },
    inputGroup: { marginBottom: SPACE.lg },
    rowForm: { flexDirection: 'row', justifyContent: 'space-between' },
    label: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textMuted, marginBottom: 8, letterSpacing: 0.5 },
    input: {
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderRadius: RADIUS.md,
      paddingHorizontal: 16,
      height: 48,
      fontFamily: FONT_FAMILY.body,
      fontSize: 15,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },

    videoInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    previewVideoBtn: {
      width: 48,
      height: 48,
      borderRadius: RADIUS.md,
      backgroundColor: colors.accentPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoContainer: { width: '100%', borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SPACE.xl, marginTop: SPACE.sm },

    masterSplitContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACE.md },
    masterSplitTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary, marginBottom: 4 },
    masterSplitDesc: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted },

    divider: { height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border, marginVertical: SPACE.xl },
    sectionTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginBottom: SPACE.md },

    historyItem: {
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACE.md,
      marginBottom: SPACE.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.md },
    historyDate: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary },
    historySummary: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.accentPrimary },

    setsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    setBubble: { backgroundColor: isDark ? '#2C2C2E' : colors.surface2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
    setBubbleCompleted: { backgroundColor: isDark ? 'rgba(165,153,255, 0.15)' : 'rgba(108,92,231,0.12)' },
    setBubbleMissed: { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)' },
    setBubbleText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary },

    emptyState: { alignItems: 'center', marginTop: 20, gap: SPACE.md },
    emptyText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textMuted },

    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: 'rgba(255, 69, 58, 0.1)', borderRadius: RADIUS.md },
    deleteBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#FF453A' },
  });
