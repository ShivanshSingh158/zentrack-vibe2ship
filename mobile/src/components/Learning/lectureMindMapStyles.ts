import { StyleSheet } from 'react-native';
import { FONT_FAMILY } from '../../theme/tokens';

export const CANVAS_SIZE = 1600;
export const CX = CANVAS_SIZE / 2;
export const CY = CANVAS_SIZE / 2;
export const BRANCH_RADIUS = 285;
export const LEAF_RADIUS_INNER = 475;
export const LEAF_RADIUS_OUTER = 595;

export const BRANCH_COLORS_DARK = [
  '#a599ff', // Lavender Purple
  '#38bdf8', // Sky Blue
  '#22c55e', // Emerald Green
  '#fbbf24', // Amber Yellow
  '#f472b6', // Neon Pink
  '#fb923c', // Warm Coral
];

export const BRANCH_COLORS_LIGHT = [
  '#6C5CE7', // Royal Amethyst
  '#0284C7', // Sky Blue
  '#059669', // Emerald Green
  '#D97706', // Amber Yellow
  '#DB2777', // Berry Pink
  '#EA580C', // Warm Coral
];

export const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
  },
  badge: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.10)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.25)',
  },
  badgeText: {
    color: colors.accentPrimary,
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
  },
  sub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 2,
  },
  pdfBtnText: {
    color: isDark ? '#080510' : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11.5,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.surface2 || '#ECEBF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 16,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#ECEBF2',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hintText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 32,
  },
  loadingSpinnerCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadTitle: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
    marginTop: 6,
  },
  loadSub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.medium,
    color: '#f87171',
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 9,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.3)' : 'rgba(108,92,231,0.25)',
  },
  retryText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.bold,
    color: colors.accentPrimary,
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: isDark ? '#0a0a0e' : '#F8F7FC',
  },
  board: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    position: 'absolute',
  },
  dotGrid: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    opacity: isDark ? 0.18 : 0.08,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
  },
  centerHub: {
    position: 'absolute',
    width: 200,
    minHeight: 92,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.45 : 0.2,
    shadowRadius: 18,
    elevation: 12,
    zIndex: 10,
  },
  centerGlowRing: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.2)' : 'rgba(108,92,231,0.15)',
    pointerEvents: 'none',
  },
  centerHubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.10)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 6,
  },
  centerHubBadgeText: {
    fontSize: 9,
    fontFamily: FONT_FAMILY.bold,
    color: colors.accentPrimary,
    letterSpacing: 0.5,
  },
  centerHubText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    textAlign: 'center',
    lineHeight: 19,
  },
  branchCard: {
    position: 'absolute',
    width: 164,
    minHeight: 66,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 9,
  },
  branchTopPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginBottom: 4,
  },
  branchPillText: {
    fontSize: 8.5,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 0.4,
  },
  branchTitle: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.bold,
    textAlign: 'center',
    lineHeight: 16,
  },
  leafCard: {
    position: 'absolute',
    width: 152,
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.2 : 0.08,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 8,
  },
  leafBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  leafText: {
    flex: 1,
    fontSize: 11,
    fontFamily: FONT_FAMILY.medium,
    color: colors.textPrimary,
    lineHeight: 15,
  },
  zoomToolbar: {
    position: 'absolute',
    right: 18,
    bottom: 74,
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(24, 24, 27, 0.94)' : '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.4 : 0.12,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 99,
  },
  zoomBtn: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomPercentText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    color: colors.accentPrimary,
  },
  zoomDivider: {
    width: 22,
    height: 1,
    backgroundColor: colors.border,
  },
  // ── Bottom Legend ──
  bottomLegend: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    zIndex: 90,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: isDark ? 'rgba(24, 24, 27, 0.92)' : '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendChipText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.medium,
    color: colors.textPrimary,
  },
});

