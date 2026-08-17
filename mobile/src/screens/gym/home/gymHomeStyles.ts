/**
 * gymHomeStyles.ts — ZenTrack Gym Module
 *
 * All StyleSheet.create() calls for GymHomeScreen.
 * Extracted to keep the screen coordinator lean.
 */
import { StyleSheet } from 'react-native';
import { COLORS } from '../../../theme/tokens';

export const gymHomeStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 95, paddingTop: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.surfaceRaised || COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  moveActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.accentDim, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 10, borderRadius: 14 },
  moveActionText: { fontSize: 13, fontWeight: '700', color: COLORS.accentPrimary },
  posRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: COLORS.surface2 || COLORS.surface, marginBottom: 6 },
  posRowActive: { backgroundColor: COLORS.accentPrimary },
  posNum: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, width: 30 },
  posName: { flex: 1, fontSize: 13, color: COLORS.textPrimary, marginRight: 8 },

  // ── Kept for legacy refs but header is now the floatingNav ──────────────
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, paddingTop: 14 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'Inter-Bold' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  // ── Floating Glassmorphism Sticky Nav Bar ────────────────────────────────
  floatingNav: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    overflow: 'hidden',
  },
  floatingNavInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: COLORS.surface,
  },
  floatingNavActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  floatingNavBtn: {
    alignItems: 'center',
    gap: 3,
    minWidth: 42,
  },
  floatingNavBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface2 || COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  floatingNavBtnAccent: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accentPrimary,
  },
  floatingNavBtnText: {
    fontSize: 9.5,
    fontFamily: 'Inter-Medium',
    color: COLORS.textTertiary,
    letterSpacing: 0.2,
  },

  weekStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  weekDaysContainer: { flexDirection: 'row', flex: 1, justifyContent: 'space-evenly', alignItems: 'center' },
  weekNavBtn: { paddingVertical: 12, paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center', opacity: 0.7 },
  dayCol: { alignItems: 'center', gap: 6 },
  dayLetter: { fontSize: 11, color: COLORS.textTertiary, fontFamily: 'Inter-Regular' },
  dayLetterActive: { color: COLORS.textPrimary },
  dayPill: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  dayPillActive: { backgroundColor: COLORS.accentPrimary, borderRadius: 18, overflow: 'hidden' },
  dayNum: { fontSize: 13, color: COLORS.textTertiary, fontFamily: 'Inter-Regular' },
  dayNumActive: { color: '#ffffff', fontWeight: '700' },

  muscleSection: { paddingHorizontal: 8, marginBottom: 16 },
  muscleDiagramWrapper: { alignItems: 'center', paddingVertical: 8 },
  muscleLegend: { flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 10, color: COLORS.textTertiary, fontFamily: 'Inter-Regular' },

  workoutSection: { paddingHorizontal: 8, marginBottom: 8 },
  startBtn: { backgroundColor: COLORS.surface, borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  startBtnText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', letterSpacing: 1 },

  completedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.accentGreenDim, borderRadius: 16, padding: 16 },
  completedBannerLeft: { gap: 2 },
  completedBannerTitle: { fontSize: 15, fontWeight: '700', color: COLORS.accentGreen },
  completedBannerSub: { fontSize: 13, color: COLORS.textMuted },
  streakBadgeInline: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: COLORS.accentAmberDim },
  streakBadgeInlineText: { fontSize: 12, fontWeight: '700', color: COLORS.accentAmber },

  readinessBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },

  activeBanner: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: COLORS.border },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accentAmber },
  activeBannerTitle: { fontSize: 10, fontWeight: '700', color: COLORS.accentAmber, letterSpacing: 1 },
  activeBannerResume: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },

  section: { paddingHorizontal: 8, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, marginBottom: 12, marginLeft: 4, letterSpacing: 2 },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, padding: 16, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  cardioSquare: { width: 20, height: 20, borderRadius: 4, backgroundColor: COLORS.surface2 || COLORS.surface, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  checkboxCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  checkboxCircleDone: { backgroundColor: COLORS.accentGreen, borderColor: COLORS.accentGreen },
  rowTextCol: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  rowSubtitle: { fontSize: 12, color: COLORS.textMuted },
  textStrikethrough: { textDecorationLine: 'line-through', color: COLORS.textTertiary },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn: { padding: 8, marginHorizontal: -4 },

  fabAi: { position: 'absolute', bottom: 110, right: 24, borderRadius: 24, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  fabGradient: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accentPrimary },

  restTimerOverlay: { position: 'absolute', bottom: 110, alignSelf: 'center', backgroundColor: COLORS.surfaceRaised || COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 30, paddingVertical: 12, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, elevation: 10, zIndex: 9999 },
  restTimerLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textTertiary, letterSpacing: 1 },
  restTimerText: { fontFamily: 'Courier', fontSize: 24, color: COLORS.accentGreen, fontWeight: 'bold' },
  restTimerClose: { marginLeft: 8 },
  routineHeaderBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12, backgroundColor: COLORS.surface, marginHorizontal: 8, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  routineInfoCol: { flex: 1, paddingRight: 8 },
  routineLabelText: { fontSize: 10, fontWeight: '700', color: COLORS.textTertiary, letterSpacing: 1.5, marginBottom: 2 },
  routineNameText: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  smallSwapIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accentDim, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
});
