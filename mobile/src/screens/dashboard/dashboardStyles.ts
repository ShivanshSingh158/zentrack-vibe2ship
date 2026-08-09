/**
 * dashboardStyles.ts
 * All styles for DashboardScreen — extracted to reduce the main coordinator size.
 */
import { StyleSheet } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';

export const makeStyles = (colors: any) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: 6, paddingTop: SPACE.xs },

  greetingContainer: {
    marginTop: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingGood: { fontFamily: FONT_FAMILY.bold, fontSize: 34, color: colors.textPrimary, lineHeight: 40 },
  greetingTime: { fontFamily: FONT_FAMILY.title, fontSize: 34, color: colors.accentPrimary, lineHeight: 40 },

  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { fontSize: 16, fontFamily: FONT_FAMILY.bold, color: colors.background },

  headerStreakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,159,77,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,77,0.22)',
  },
  headerStreakText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    color: '#ff9f4d',
    letterSpacing: 0.2,
  },

  quoteText: {
    fontFamily: FONT_FAMILY.body,
    fontStyle: 'italic',
    fontSize: FONT_SIZE.base,
    color: colors.textPrimary,
    lineHeight: 23,
  },
  quoteAuthor: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: colors.accentPrimary,
    marginTop: SPACE.sm,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  statsContainer: {
    flexDirection: 'row',
    marginTop: SPACE.xxl,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.md,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  healthWidgetsRow: {
    flexDirection: 'row',
    marginTop: SPACE.md,
    gap: SPACE.sm,
  },
  healthCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.xl,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBox:   { alignItems: 'center', minWidth: 70 },
  statLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACE.xs,
  },
  statValue: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.base,
    color: colors.textSecondary,
  },
  hairlineVertical: { width: 1, height: 28, backgroundColor: colors.border },
  statTapHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 7,
    color: colors.textTertiary,
    marginTop: 3,
    letterSpacing: 0.3,
  },

  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: SPACE.lg,
    marginHorizontal: SPACE.sm,
  },

  xpContainer: { marginBottom: SPACE.md, paddingHorizontal: SPACE.xs },
  xpRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  xpLabel:     { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: colors.accentPrimary, letterSpacing: 0.5 },
  xpXpText:    { fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textTertiary },
  xpBarBg:     { height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  xpBarFill:   { height: '100%' as any, backgroundColor: colors.accentPrimary, borderRadius: 2 },

  captureBar: {
    marginTop: SPACE.md,
    marginBottom: SPACE.md,
    backgroundColor: colors.surface,
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
    marginTop: SPACE.xl,
    backgroundColor: 'rgba(255,159,77,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,77,0.25)',
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
  },
  urgentTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.accentAmber, letterSpacing: 0.5, marginBottom: 4 },
  urgentItem:  { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted, lineHeight: 18 },

  sectionLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textTertiary,
    marginBottom: 0,
    textTransform: 'uppercase',
  },

  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  agendaRowText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: colors.textPrimary },
  agendaRowTime: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textTertiary },

  // XP Pop-up
  xpPopup: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    zIndex: 999,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  xpPopupText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: colors.accentPrimary,
  },
});
