import { StyleSheet } from 'react-native';
import { FONT_FAMILY } from '../../theme/tokens';

export const makeGymTemplateStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
    content: {
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 20,
      paddingBottom: 28,
      maxHeight: '88%',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#E2E1EA',
    },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
    title: { fontSize: 19, fontFamily: FONT_FAMILY.bold, color: isDark ? '#FFFFFF' : '#1C1C1E' },
    closeBtn: { padding: 4, margin: -4 },
    desc: { fontSize: 12, fontFamily: FONT_FAMILY.body, color: isDark ? '#A1A1AA' : '#636366', marginTop: 2, lineHeight: 16 },

    scroll: { flexGrow: 0 },
    scrollContent: { paddingBottom: 16 },
    sectionHeader: { fontSize: 10.5, fontFamily: FONT_FAMILY.bold, color: isDark ? 'rgba(255,255,255,0.45)' : '#8E8E93', letterSpacing: 1.2, marginBottom: 8 },

    splitGrid: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 4,
    },
    splitCard: {
      flex: 1,
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E2E1EA',
      justifyContent: 'space-between',
    },
    splitCardActive: {
      borderColor: isDark ? '#a599ff' : colors.accentPrimary,
      backgroundColor: isDark ? 'rgba(165,153,255,0.06)' : 'rgba(108,92,231,0.06)',
    },
    splitCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    splitCardTitle: { fontSize: 13, fontFamily: FONT_FAMILY.bold, color: isDark ? '#FFFFFF' : '#1C1C1E', flex: 1 },
    splitCardTitleActive: { color: isDark ? '#FFFFFF' : '#1C1C1E' },
    splitCardBadge: { fontSize: 10.5, fontFamily: FONT_FAMILY.medium, color: isDark ? '#a599ff' : colors.accentPrimary, marginBottom: 4 },
    splitCardDetail: { fontSize: 11, fontFamily: FONT_FAMILY.body, color: isDark ? '#A1A1AA' : '#636366', lineHeight: 15 },

    scheduleCard: {
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 12,
      marginBottom: 7,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E2E1EA',
    },
    scheduleCardActive: {
      borderColor: isDark ? '#a599ff' : colors.accentPrimary,
      backgroundColor: isDark ? 'rgba(165,153,255,0.06)' : 'rgba(108,92,231,0.06)',
    },
    scheduleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
    scheduleTitle: { fontSize: 13, fontFamily: FONT_FAMILY.bold, color: isDark ? '#FFFFFF' : '#1C1C1E' },
    scheduleSub: { fontSize: 10.5, fontFamily: FONT_FAMILY.body, color: isDark ? '#A1A1AA' : '#636366', marginLeft: 22 },
    restPill: {
      backgroundColor: isDark ? 'rgba(255,159,77,0.12)' : 'rgba(217,119,6,0.10)',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,159,77,0.25)' : 'rgba(217,119,6,0.25)',
    },
    restPillText: { fontSize: 9.5, fontFamily: FONT_FAMILY.bold, color: isDark ? '#FFAA55' : '#D97706' },

    applyBtn: {
      backgroundColor: isDark ? '#FFFFFF' : colors.accentPrimary,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.15,
      shadowRadius: 6,
      elevation: 4,
    },
    applyBtnText: {
      color: isDark ? '#000000' : '#FFFFFF',
      fontSize: 15,
      fontFamily: FONT_FAMILY.bold,
    },
  });
