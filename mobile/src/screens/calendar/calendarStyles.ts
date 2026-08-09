/**
 * calendarStyles.ts
 * All styles for CalendarScreen. Extracted to reduce coordinator file size.
 */
import { StyleSheet } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { HOUR_HEIGHT } from './calendarUtils';

export const makeStyles = (colors: any) => StyleSheet.create({
  root: { 
    flex: 1, 
    backgroundColor: colors.background // Matched exactly to the screenshot's deep dark hue
  },
  
  /* 1. Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 12,
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
    backgroundColor: '#a599ff', // matches screenshot avatar color
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitials: {
    color: '#000',
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
    fontFamily: FONT_FAMILY.bold, // screenshot shows bold title for month
    fontSize: 28,
    color: colors.textPrimary,
  },
  viewSelector: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E', // dark grey pill background
    borderRadius: 8,
    padding: 2,
  },
  viewSelectorBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  viewSelectorBtnActive: {
    backgroundColor: '#a599ff', // Active purple pill
  },
  viewSelectorText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  viewSelectorTextActive: {
    color: '#000',
    fontFamily: FONT_FAMILY.bold,
  },

  /* Month Dropdown */
  monthDropdownContainer: {
    position: 'absolute',
    top: 85, // moved down so it doesn't block the header
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
    paddingTop: 8,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
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
    backgroundColor: colors.surface,
  },
  monthChipActive: {
    backgroundColor: colors.surface2,
  },
  monthChipText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    color: colors.textPrimary,
  },
  monthChipTextActive: {
    color: colors.accentPrimary,
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
    color: '#fff',
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
    backgroundColor: '#a599ff', 
  },
  dayNum: { 
    fontSize: 18, 
    color: colors.textPrimary, 
    fontFamily: FONT_FAMILY.body 
  },
  dayNumActive: { 
    color: '#000', 
    fontFamily: FONT_FAMILY.bold 
  },

  /* 3. Timeline */
  timelineScroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  timelineInner: {
    // height removed, set dynamically inline
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
    marginTop: -8, // Center text on the line
  },
  hourLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border, // Very subtle grid line
  },
  eventsContainer: {
    position: 'absolute',
    top: 0,
    left: 60, // Right of the hour text
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
    left: 54, // left edge aligned with line
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  currentTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#a599ff', // fixed to purple
    marginLeft: 0,
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#a599ff', // fixed to purple
  },

  /* 4. FAB */
  fab: {
    position: 'absolute',
    bottom: 110, // moved up above tab bar
    right: 20, // matched with Sara button
    width: 48, // matched with Sara button
    height: 48,
    borderRadius: 24,
    backgroundColor: '#a599ff', // standard purple
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#a599ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.surface,
    width: '100%',
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
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
  weekColToday: { backgroundColor: 'rgba(165,153,255,0.04)' },
  weekHourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  weekCurrentTimeTick: { position: 'absolute', left: 0, width: 12, height: 2, backgroundColor: colors.accentPrimary, zIndex: 10 },
  weekEventBlock: { position: 'absolute', left: 1, right: 1, borderRadius: 4, padding: 2, borderLeftWidth: 2, overflow: 'hidden' },
  weekEventTitle: { fontSize: 9, fontWeight: '600', fontFamily: FONT_FAMILY.medium },
  
  /* Month View Styles */
  monthViewContainer: { flex: 1 },
  monthEventListContainer: { flex: 1, paddingHorizontal: 8, paddingTop: 16 },
  monthEventListHeader: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 12, letterSpacing: 1 },
  monthEventRow: { backgroundColor: '#1c1c1e', padding: 12, borderRadius: 12, marginBottom: 8, borderLeftWidth: 3 },
  monthEventTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
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
  },
});
