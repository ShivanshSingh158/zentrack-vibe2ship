import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Modal, Pressable } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { FONT_FAMILY, RADIUS } from '../theme/tokens';
import { useTheme } from "../contexts/ThemeContext";

interface UniversalCalendarModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string;
  onDateSelect: (date: string) => void;
  title?: string;
}

const UniversalCalendarModal = React.memo(function UniversalCalendarModal({
  visible,
  onClose,
  selectedDate,
  onDateSelect,
  title = "Select Date"
}: UniversalCalendarModalProps) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <BlurView experimentalBlurMethod="dimezisBlurView" intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
        
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
              current={selectedDate}
              onDayPress={(day: DateData) => {
                onDateSelect(day.dateString);
                onClose(); // Automatically close when a date is selected
              }}
              markedDates={{
                [selectedDate]: { selected: true, selectedColor: '#ff3b30' } // Apple Calendar red accent
              }}
              theme={{
                backgroundColor: 'transparent',
                calendarBackground: 'transparent',
                textSectionTitleColor: '#8e8e93', // Subtle gray for Mon, Tue, etc.
                selectedDayBackgroundColor: '#ff3b30',
                selectedDayTextColor: '#ffffff',
                todayTextColor: '#ff3b30',
                dayTextColor: colors.textPrimary,
                textDisabledColor: '#3a3a3c',
                arrowColor: colors.textPrimary,
                monthTextColor: colors.textPrimary,
                indicatorColor: '#ff3b30',
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

const makeStyles = (colors: any) => StyleSheet.create({
      centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      },
      calendarCard: {
        backgroundColor: '#1c1c1e', // Apple iOS dark mode modal gray
        borderRadius: RADIUS.lg,
        width: '100%',
        maxWidth: 360,
        padding: 16,
        paddingTop: 12,
        borderWidth: 1,
        borderColor: '#2c2c2e',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
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
        backgroundColor: '#2c2c2e',
        borderRadius: 15,
        width: 30,
        height: 30,
        justifyContent: 'center',
        alignItems: 'center',
      }
    });

export default UniversalCalendarModal;
