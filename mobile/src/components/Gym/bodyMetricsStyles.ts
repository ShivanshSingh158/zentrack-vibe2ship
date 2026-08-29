import { StyleSheet } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';

export const makeBodyMetricsStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 4,
    },
    sheetTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      alignItems: "center",
      justifyContent: "center",
    },

    // ── Stats Grid ───────────────────────────────────────────────────────────
    statsGrid: {
      flexDirection: "row",
      gap: 10,
    },
    statCard: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.surface,
      borderRadius: RADIUS.lg,
      padding: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
    },
    statLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9,
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    statValue: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 18,
      color: colors.textPrimary,
      marginTop: 2,
    },
    statSubText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10,
      color: colors.textMuted,
    },

    // ── BMI Card ─────────────────────────────────────────────────────────────
    bmiCard: {
      flexDirection: "row",
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.surface,
      borderRadius: RADIUS.xl,
      padding: 16,
      borderWidth: 1,
      alignItems: "center",
      gap: 16,
    },
    bmiLeft: {
      alignItems: "center",
      paddingRight: 16,
      borderRightWidth: 1,
      borderRightColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
      minWidth: 80,
    },
    bmiLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    bmiValue: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 28,
      marginVertical: 2,
    },
    bmiPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      marginTop: 2,
    },
    bmiPillText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
    },
    bmiRight: {
      flex: 1,
      gap: 6,
    },
    metricRow: {
      fontSize: 13,
      fontFamily: FONT_FAMILY.body,
    },
    metricLabel: {
      color: colors.textMuted,
    },
    metricValue: {
      color: colors.textPrimary,
      fontFamily: FONT_FAMILY.bold,
    },
    emptyBmiCard: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.surface,
      borderRadius: RADIUS.xl,
      padding: 20,
      alignItems: "center",
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
      gap: 8,
    },
    iconBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyBmiTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    emptyBmiText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 17,
    },

    // ── Target Progress & Chart Section ──────────────────────────────────────
    sectionCard: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.surface,
      borderRadius: RADIUS.xl,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
      gap: 12,
    },
    cardHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    badgeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: colors.accentPrimary,
    },
    progressTrack: {
      height: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      borderRadius: 4,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: colors.accentPrimary,
      borderRadius: 4,
    },
    progressLabels: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    progressLabel: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 11,
      color: colors.textMuted,
    },
    chartContainer: {
      alignItems: "center",
      marginVertical: 4,
    },

    // ── Log Form ─────────────────────────────────────────────────────────────
    logForm: {
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderRadius: RADIUS.xl,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
      gap: 12,
    },
    formTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
    },
    inputGroup: {
      gap: 4,
    },
    inputLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    weightInput: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.surface2 || '#f5f5f5',
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      fontFamily: FONT_FAMILY.bold,
      fontSize: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    },
    photoBtn: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.md,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
    },
    photoPreviewRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.surface2 || '#f5f5f5',
      padding: 8,
      borderRadius: RADIUS.md,
    },
    photoPreviewThumb: {
      width: 40,
      height: 40,
      borderRadius: 6,
    },
    photoAttachedText: {
      flex: 1,
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textMuted,
    },
    formActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
    },
    saveFormBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: isDark ? '#ffffff' : colors.accentPrimary,
      borderRadius: RADIUS.md,
      paddingVertical: 12,
    },
    saveFormBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
      color: isDark ? '#000000' : '#ffffff',
    },
    cancelFormBtn: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.md,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      alignItems: "center",
      justifyContent: "center",
    },
    logWeightBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: isDark ? '#ffffff' : colors.accentPrimary,
      borderRadius: RADIUS.lg,
      paddingVertical: 14,
    },
    logWeightBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: isDark ? '#000000' : '#ffffff',
    },

    // ── Photo Modal ──────────────────────────────────────────────────────────
    photoModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.9)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    fullPhoto: {
      width: "100%",
      height: "70%",
      borderRadius: RADIUS.lg,
    },
    closePhotoModalBtn: {
      position: "absolute",
      top: 50,
      right: 20,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
  });
