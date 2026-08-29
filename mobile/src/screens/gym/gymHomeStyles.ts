/**
 * gymHomeStyles.ts — ZenTrack Gym Module
 *
 * Cleaned stylesheet factory for GymHomeScreen.
 * Pruned legacy unused style tokens to optimize mount performance and bundle size.
 */
import { StyleSheet } from 'react-native';
import { FONT_FAMILY } from '../../theme/tokens';

export const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },
  scrollContent: { paddingBottom: 95, paddingTop: 48 },

  weekStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 4, marginBottom: 2 },
  weekDaysContainer: { flexDirection: 'row', flex: 1, justifyContent: 'space-evenly', alignItems: 'center' },
  weekNavBtn: { paddingVertical: 12, paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center', opacity: 0.7 },
  dayCol: { alignItems: 'center', gap: 2 },
  dayLetter: { fontSize: 10.5, color: colors.textTertiary, fontFamily: 'Inter-Medium', marginBottom: 1 },
  dayLetterActive: { color: colors.textPrimary },
  dayPill: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  dayPillActive: { backgroundColor: isDark ? '#a599ff' : colors.accentPrimary, borderRadius: 18, overflow: 'hidden' },
  dayNum: { fontSize: 13, color: colors.textTertiary, fontFamily: 'Inter-Regular' },
  dayNumActive: { color: isDark ? '#000000' : '#ffffff', fontWeight: '700' },

  workoutSection: { paddingHorizontal: 8, marginBottom: 8 },
  startBtn: {
    backgroundColor: isDark ? '#1C1C1E' : colors.accentGreen,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.accentGreen,
  },
  startBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },

  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? 'rgba(94,218,158,0.12)' : 'rgba(16,185,129,0.10)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: isDark ? 'transparent' : 'rgba(16,185,129,0.25)',
  },
  completedBannerLeft: { gap: 2 },
  completedBannerTitle: { fontSize: 15, fontWeight: '700', color: isDark ? '#5eda9e' : '#059669' },
  completedBannerSub: { fontSize: 13, color: colors.textMuted },
  streakBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(255,159,77,0.1)' : 'rgba(249,115,22,0.12)',
  },
  streakBadgeInlineText: { fontSize: 12, fontWeight: '700', color: isDark ? '#ff9f4d' : '#EA580C' },

  readinessBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },

  activeBanner: {
    backgroundColor: isDark ? '#1a140b' : '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: isDark ? '#4d3b20' : '#FDE68A',
  },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: isDark ? '#eab308' : '#D97706' },
  activeBannerTitle: { fontSize: 10, fontWeight: '700', color: isDark ? '#eab308' : '#B45309', letterSpacing: 1 },
  activeBannerResume: { fontSize: 14, fontWeight: '600', color: isDark ? '#ffffff' : '#B45309' },

  section: { paddingHorizontal: 8, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, marginBottom: 12, marginLeft: 4, letterSpacing: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#1C1C1E' : colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
  },
  cardioSquare: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: isDark ? '#2C2C2E' : 'rgba(14,165,233,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#0284C7',
  },
  checkboxCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? '#2c2c2e' : '#D1D1D6',
    backgroundColor: isDark ? 'transparent' : '#F4F3F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  checkboxCircleDone: {
    backgroundColor: isDark ? '#5eda9e' : '#059669',
    borderColor: isDark ? '#5eda9e' : '#059669',
  },
  rowTextCol: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  rowSubtitle: { fontSize: 12, color: colors.textMuted },
  textStrikethrough: { textDecorationLine: 'line-through', color: colors.textTertiary },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn: { padding: 8, marginHorizontal: -4 },

  // ── Single Morphing Sticky Header Styles ─────────────────────────────────
  topHeaderWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'transparent',
  },
  headerInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '700',
    fontFamily: 'Inter-Bold',
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  morphBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 35,
  },
  morphBtnIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  morphBtnPill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(255,255,255,0.09)' : colors.surface,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : colors.border,
  },
  morphBtnPillAccent: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.16)' : colors.accentDim,
    borderColor: isDark ? 'rgba(165,153,255,0.32)' : colors.accentPrimary,
  },
  headerBtnText: {
    fontSize: 8.5,
    color: colors.textTertiary,
    fontFamily: 'Inter-Medium',
    marginTop: 1,
    textAlign: 'center',
  },

  // ── Themed Action Sheet Menu Styles ──────────────────────────────────────
  menuActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: isDark ? '#1C1C1E' : '#F5F4FA',
    marginBottom: 6,
    gap: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
  },
  menuActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuActionTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
  },
  menuActionSub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
    color: colors.textMuted,
    marginTop: 2,
  },
  menuCancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E1EA',
  },
  menuCancelText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
  },
});
