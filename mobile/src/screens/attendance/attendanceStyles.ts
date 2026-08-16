/**
 * attendanceStyles.ts
 * All styles for the Attendance module — extracted from the main screen.
 */
import { StyleSheet } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';

export const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  overviewCard: { marginHorizontal: 0, marginTop: 12, marginBottom: 12, padding: SPACE.lg, backgroundColor: 'rgba(16,185,129,0.05)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  overviewTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary },
  overviewStats: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted },
  overviewPct: { fontFamily: FONT_FAMILY.title, fontSize: 32, fontWeight: 'bold' as const },
  progressBarBg: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' as const },
  progressBarFill: { height: '100%' as const, borderRadius: 3 },

  warningBanner: { marginHorizontal: 0, marginBottom: SPACE.sm, padding: SPACE.lg, backgroundColor: 'rgba(239,68,68,0.1)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },

  weekStrip: { flexDirection: 'row' as const, paddingHorizontal: 16, gap: 6, marginBottom: SPACE.md },
  weekPill: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center' as const, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  weekPillActive: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
  weekPillToday: { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.4)' },
  weekPillDay: { fontSize: 10, color: colors.textMuted, marginBottom: 2, fontWeight: 'bold' as const },
  weekPillLabel: { fontSize: 12, color: colors.textPrimary, fontWeight: 'bold' as const },

  scheduleHeader: { paddingHorizontal: 16, marginBottom: SPACE.sm },
  scheduleTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },

  list: { paddingHorizontal: 0, paddingBottom: 100 },
  emptyState: { alignItems: 'center' as const, paddingVertical: 60, gap: 12, backgroundColor: 'rgba(16,185,129,0.05)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  emptyText: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textMuted },

  subjectCard: { backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border, marginBottom: 0, overflow: 'hidden' as const },
  subjectHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, padding: SPACE.md, backgroundColor: 'rgba(0,0,0,0.1)', borderBottomWidth: 1, borderColor: colors.border },
  subjectName: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary },
  subjectTarget: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted },

  sessionSection: { flexDirection: 'row' as const, padding: SPACE.md },
  sessionInfo: { flex: 1, paddingRight: SPACE.md },
  sessionLabel: { fontSize: 10, color: colors.textMuted, fontWeight: 'bold' as const, marginBottom: 4 },
  sessionPct: { fontFamily: FONT_FAMILY.title, fontSize: 24, fontWeight: 'bold' as const },
  sessionCounts: { fontSize: 11, color: colors.textMuted },
  sessionUrgency: { fontSize: 10, marginTop: 4, fontWeight: 'bold' as const },
  sessionList: { flex: 2, gap: 6 },
  logRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, backgroundColor: colors.background, padding: 8, borderRadius: 8 },
  logLabel: { fontSize: 12, fontWeight: 'bold' as const, color: colors.textPrimary },
  logStatus: { fontSize: 11, fontWeight: 'bold' as const },
  undoBtn: { padding: 4, backgroundColor: colors.surface2, borderRadius: 4 },
  actionBtn: { padding: 6, borderRadius: 6, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  inlineLogBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.02)' },

  // Modals
  modalRoot: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, padding: SPACE.md, borderBottomWidth: 1, borderColor: colors.border },
  modalTitle: { fontFamily: FONT_FAMILY.title, fontSize: 18, color: colors.textPrimary },
  modalHeaderBtn: { padding: 4 },

  configCard: { backgroundColor: colors.surface, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm, borderWidth: 1, borderColor: colors.border },
  configName: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.accentPrimary },
  configInputName: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.accentPrimary, padding: 0, flex: 1, borderBottomWidth: 1, borderColor: colors.border },
  configInputSmall: { width: 40, height: 24, backgroundColor: colors.background, borderRadius: 4, textAlign: 'center' as const, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, padding: 0 },
  configInputGrid: { width: 28, height: 24, backgroundColor: colors.background, borderRadius: 4, textAlign: 'center' as const, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, padding: 0 },

  historyCard: { backgroundColor: colors.surface, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },

  overlayBg: { flex: 1, justifyContent: 'flex-end' as const, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: colors.surface, padding: SPACE.xl, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl },
  sheetTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary, textAlign: 'center' as const, marginBottom: SPACE.md },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  chipActive: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
  chipText: { fontSize: 12, color: colors.textPrimary },
  extraBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(255,255,255,0.05)' },

  // Extra Class Modal
  subjectSelectRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  subjectSelectRowActive: {
    backgroundColor: 'rgba(165,153,255,0.08)', borderColor: 'rgba(165,153,255,0.25)',
  },
  subjectSelectDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' },
  subjectSelectText: { flex: 1, fontFamily: FONT_FAMILY.medium, fontSize: 14, color: '#8e8e93' },
  extraTypeRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  extraTypeLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#ffffff', letterSpacing: 0.3 },
  extraTypeActions: { flexDirection: 'row' as const, gap: 8 },
  extraActionBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  extraActionAttended: { backgroundColor: 'rgba(94,218,158,0.08)', borderColor: 'rgba(94,218,158,0.2)' },
  extraActionAttendedText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#5eda9e' },
  extraActionMissed: { backgroundColor: 'rgba(255,105,97,0.08)', borderColor: 'rgba(255,105,97,0.2)' },
  extraActionMissedText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#ff6961' },
  extraCancelBtn: { marginTop: 16, alignItems: 'center' as const, paddingVertical: 12 },
  extraCancelText: { fontFamily: FONT_FAMILY.medium, fontSize: 14, color: '#636366' },

  // ── Single Morphing Sticky Header Styles ─────────────────────────────────
  topHeaderWrapper: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'transparent',
  },
  headerInner: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '700' as const,
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
  },
  morphBtn: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minWidth: 36,
  },
  morphBtnIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    position: 'relative' as const,
  },
  morphBtnPill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  morphBtnPillAccent: {
    backgroundColor: 'rgba(165,153,255,0.16)',
    borderColor: 'rgba(165,153,255,0.32)',
  },
  morphBtnPillHoliday: {
    backgroundColor: 'rgba(251,191,36,0.14)',
    borderColor: 'rgba(251,191,36,0.35)',
  },
  headerBtnText: {
    fontSize: 8.5,
    color: colors.textTertiary,
    fontFamily: FONT_FAMILY.medium,
    marginTop: 1,
    textAlign: 'center' as const,
  },
});
