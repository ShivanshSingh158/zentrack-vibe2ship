/**
 * calendarStyles.ts
 * All styles for CalendarScreen. Extracted to reduce coordinator file size.
 */
import { StyleSheet } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { HOUR_HEIGHT } from './calendarUtils';

export const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { 
    flex: 1, 
    backgroundColor: colors.background,
  },
  
  /* 1. Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  headerLeft: {
    width: 40,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  iconBtn: {
    padding: 8,
  },
  profileBtn: {
    padding: 4,
    marginLeft: 8,
  },
  profileCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? '#a599ff' : colors.accentPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitials: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },

  /* 1.5 Sub Header */
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: colors.background,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  viewSelector: {
    flexDirection: 'row',
    backgroundColor: isDark ? '#1E1E1E' : '#EAE9F2',
    borderRadius: 8,
    padding: 2,
  },
  viewSelectorBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    width: 64,
    alignItems: 'center',
    borderRadius: 6,
  },
  viewSelectorBtnActive: {
    backgroundColor: isDark ? '#a599ff' : colors.accentPrimary,
  },
  viewSelectorText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  viewSelectorTextActive: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
  },

  /* Month Dropdown */
  monthDropdownContainer: {
    position: 'absolute',
    top: 85,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
    paddingTop: 8,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: isDark ? 0.5 : 0.12,
    shadowRadius: 10,
    elevation: 10,
  },
  monthChipsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 12,
    gap: 8,
  },
  monthChip: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: isDark ? '#000000' : '#F5F4FA',
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthChipActive: {
    backgroundColor: isDark ? '#08080A' : 'rgba(108,92,231,0.12)',
    borderColor: colors.accentPrimary,
  },
  monthChipText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    color: colors.textPrimary,
  },
  monthChipTextActive: {
    color: colors.accentPrimary,
    fontFamily: FONT_FAMILY.bold,
  },

  /* 2. Date Selector (Week Strip) */
  weekStrip: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 8, 
    marginBottom: 16,
    paddingTop: 8,
    backgroundColor: colors.background,
  },
  dayCol: { 
    alignItems: 'center', 
    gap: 8 
  },
  dayLetter: { 
    fontSize: 12, 
    color: colors.textMuted, 
    fontFamily: FONT_FAMILY.body,
    fontWeight: '500'
  },
  dayLetterActive: { 
    color: isDark ? '#FFFFFF' : colors.textPrimary,
    fontFamily: FONT_FAMILY.bold,
  },
  dayPill: { 
    width: 38, 
    height: 44, 
    borderRadius: 12, 
    backgroundColor: 'transparent', 
    alignItems: 'center', 
    justifyContent: 'center', 
    overflow: 'hidden' 
  },
  dayPillActive: { 
    backgroundColor: isDark ? '#a599ff' : colors.accentPrimary, 
  },
  dayNum: { 
    fontSize: 18, 
    color: colors.textPrimary, 
    fontFamily: FONT_FAMILY.body 
  },
  dayNumActive: { 
    color: isDark ? '#000000' : '#FFFFFF', 
    fontFamily: FONT_FAMILY.bold 
  },

  /* 3. Timeline */
  timelineScroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  timelineInner: {
    position: 'relative',
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: HOUR_HEIGHT,
    flexDirection: 'row',
  },
  hourText: {
    width: 60,
    textAlign: 'center',
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -8,
  },
  hourLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  eventsContainer: {
    position: 'absolute',
    top: 0,
    left: 60,
    right: 8,
    bottom: 0,
  },
  eventBlock: {
    position: 'absolute',
    borderRadius: 6,
    padding: 4,
    paddingHorizontal: 8,
    borderLeftWidth: 3,
  },
  eventBlockTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
  },
  eventBlockLocation: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    opacity: 0.9,
    marginTop: 2,
  },
  currentTimeIndicator: {
    position: 'absolute',
    left: 54,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  currentTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: isDark ? '#a599ff' : colors.accentPrimary,
    marginLeft: 0,
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    backgroundColor: isDark ? '#a599ff' : colors.accentPrimary,
  },

  /* 4. FAB */
  fab: {
    position: 'absolute',
    bottom: 110,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: isDark ? '#a599ff' : colors.accentPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.surface,
    width: '100%',
    borderRadius: RADIUS.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: isDark ? 0.35 : 0.12,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: FONT_FAMILY.title,
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  modalText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 16,
    color: colors.textPrimary,
  },

  /* Week View Styles */
  weekHourAxis: { width: 40, position: 'relative' },
  weekHourText: { fontSize: 10, color: colors.textMuted, position: 'absolute', top: -7, left: 4 },
  weekGrid: { flex: 1, flexDirection: 'row' },
  weekCol: { flex: 1, borderLeftWidth: 1, borderLeftColor: colors.border, position: 'relative' },
  weekColToday: { backgroundColor: isDark ? 'rgba(165,153,255,0.06)' : 'rgba(108,92,231,0.04)' },
  weekHourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  weekCurrentTimeTick: { position: 'absolute', left: 0, width: 12, height: 2, backgroundColor: isDark ? '#a599ff' : colors.accentPrimary, zIndex: 10 },
  weekEventBlock: { position: 'absolute', left: 1, right: 1, borderRadius: 4, padding: 2, borderLeftWidth: 2, overflow: 'hidden' },
  weekEventTitle: { fontSize: 9, fontWeight: '600', fontFamily: FONT_FAMILY.medium },
  
  /* Month View Styles */
  monthViewContainer: { flex: 1 },
  monthEventListContainer: { flex: 1, paddingHorizontal: 8, paddingTop: 16 },
  monthEventListHeader: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 12, letterSpacing: 1 },
  monthEventRow: { backgroundColor: colors.surface, padding: 12, borderRadius: 12, marginBottom: 8, borderLeftWidth: 3, borderWidth: 1, borderColor: colors.border },
  monthEventTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4, color: colors.textPrimary },
  monthEventTime: { fontSize: 12, color: colors.textSecondary },
  emptyText: { color: colors.textMuted, fontSize: 14, marginTop: 16, textAlign: 'center' },

  /* Unscheduled Strip Styles */
  unscheduledStrip: {
    paddingHorizontal: 8,
    paddingVertical: SPACE.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  unscheduledLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  unscheduledChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F4FA',
    borderColor: colors.border,
  },
  unscheduledDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  unscheduledChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    maxWidth: 140,
    color: colors.textPrimary,
  },
});
