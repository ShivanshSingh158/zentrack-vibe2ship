import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Modal, Pressable } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { FONT_FAMILY, RADIUS } from '../theme/tokens';
import { useTheme } from "../contexts/ThemeContext";
import { formatLocalDateStr } from '../utils/dateUtils';

interface UniversalCalendarModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string;
  onDateSelect: (date: string) => void;
  title?: string;
}

export const UniversalCalendarModal = React.memo(function UniversalCalendarModal({
  visible,
  selectedDate,
  onDateSelect,
  onClose,
  title = 'Select Date'
}: UniversalCalendarModalProps) {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={25} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.centeredView}>
          <View style={styles.calendarCard} onStartShouldSetResponder={() => true}>
            
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Apple-style Calendar Theme */}
            <Calendar
              current={selectedDate || formatLocalDateStr(new Date())}
              onDayPress={(day: DateData) => {
                onDateSelect(day.dateString);
                onClose(); // Automatically close when a date is selected
              }}
              markedDates={{
                [selectedDate]: { selected: true, selectedColor: colors.accentPrimary }
              }}
              theme={{
                backgroundColor: 'transparent',
                calendarBackground: 'transparent',
                textSectionTitleColor: colors.textTertiary,
                selectedDayBackgroundColor: colors.accentPrimary,
                selectedDayTextColor: '#ffffff',
                todayTextColor: colors.accentPrimary,
                dayTextColor: colors.textPrimary,
                textDisabledColor: colors.textTertiary,
                arrowColor: colors.accentPrimary,
                monthTextColor: colors.textPrimary,
                indicatorColor: colors.accentPrimary,
                textDayFontFamily: FONT_FAMILY.body,
                textMonthFontFamily: FONT_FAMILY.heading,
                textDayHeaderFontFamily: FONT_FAMILY.body,
                textDayFontSize: 16,
                textMonthFontSize: 18,
                textMonthFontWeight: '600',
                textDayHeaderFontSize: 13,
                'stylesheet.calendar.header': {
                  header: {
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingLeft: 10,
                    paddingRight: 10,
                    marginTop: 6,
                    alignItems: 'center'
                  }
                }
              } as any}
            />
          </View>
        </View>
      </BlurView>
    </Modal>
  );
});

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    width: '100%',
    maxWidth: 360,
    padding: 16,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 20,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  title: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 18,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  closeBtn: {
    backgroundColor: isDark ? (colors.surface2 || '#2c2c2e') : '#F0EFF7',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  }
});

export default UniversalCalendarModal;
