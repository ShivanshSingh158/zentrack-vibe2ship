import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { FONT_FAMILY } from '../../theme/tokens';
import { Task } from '../../contexts/MobileDataContext';
import { useTheme } from '../../contexts/ThemeContext';

const RESCHEDULE_TIME_SLOTS = [
  '6:00 AM–7:00 AM','7:00 AM–8:00 AM','7:30 AM–8:30 AM',
  '8:00 AM–9:00 AM','8:30 AM–10:30 AM','9:00 AM–10:00 AM',
  '10:00 AM–11:00 AM','11:00 AM–12:00 PM','11:30 AM–1:30 PM',
  '12:00 PM–1:00 PM','1:00 PM–2:00 PM','1:30 PM–3:30 PM',
  '2:00 PM–3:00 PM','3:00 PM–4:00 PM','3:30 PM–5:00 PM',
  '4:00 PM–5:00 PM','5:00 PM–6:00 PM','5:30 PM–7:00 PM',
  '6:00 PM–7:00 PM','6:30 PM–8:30 PM','7:00 PM–8:00 PM',
  '8:00 PM–9:00 PM','9:00 PM–10:00 PM','9:15 PM–10:00 PM',
];

function parseF(s: string): number | null {
  if (!s) return null;
  const up = s.trim().toUpperCase();
  const pm = up.includes('PM'); const am = up.includes('AM');
  const cl = up.replace(/[APM\s]+$/i, '').trim();
  const pts = cl.split(':');
  let h = parseInt(pts[0], 10); if (isNaN(h)) return null;
  const m = pts.length >= 2 ? (parseInt(pts[1], 10) || 0) : 0;
  if (pm && h !== 12) h += 12; if (am && h === 12) h = 0;
  return h + m / 60;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedTaskIds: Set<string>;
  allTasks: Task[];
  onConfirm: (newDate: string, newTimeSlot?: string) => Promise<void>;
}

export default function BulkRescheduleSheet({ visible, onClose, selectedTaskIds, allTasks, onConfirm }: Props) {
  const { colors, isDark } = useTheme();
  const todayStr = todayString();
  const [pickedDate, setPickedDate] = useState(todayStr);
  const [pickedSlot, setPickedSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Tasks already on pickedDate (excluding the ones being moved)
  const existingBlocks = React.useMemo(() =>
    allTasks
      .filter(t => t.date === pickedDate && t.timeSlot && !selectedTaskIds.has(t.id))
      .map(t => ({ slot: t.timeSlot!, title: t.title })),
  [allTasks, pickedDate, selectedTaskIds]);

  function slotConflict(slot: string): string | null {
    const [sStr, eStr] = slot.split(/[-–]/);
    const sF = parseF(sStr); if (sF === null) return null;
    const eF = eStr ? parseF(eStr) : sF + 1;
    for (const b of existingBlocks) {
      const [bsStr, beStr] = b.slot.split(/[-–]/);
      const bsF = parseF(bsStr); if (bsF === null) continue;
      const beF = beStr ? parseF(beStr) : bsF + 1;
      if (sF < (beF ?? bsF + 1) && (eF ?? sF + 1) > bsF) return b.title;
    }
    return null;
  }

  const markedDates = React.useMemo(() => ({
    [pickedDate]: {
      selected: true,
      selectedColor: colors.accentPrimary,
      selectedTextColor: isDark ? '#000000' : '#FFFFFF',
    },
    ...(pickedDate !== todayStr ? {
      [todayStr]: {
        marked: true,
        dotColor: colors.accentPrimary,
      }
    } : {}),
  }), [pickedDate, todayStr, colors, isDark]);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(pickedDate, pickedSlot ?? undefined);
      onClose();
    }
    finally { setSaving(false); }
  };

  const conflictOnSelected = pickedSlot ? slotConflict(pickedSlot) : null;
  const friendlyDate = pickedDate === todayStr ? 'Today' : pickedDate;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.40)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          maxHeight: '92%',
          borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
          borderColor: colors.border,
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}>
            <View>
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary }}>Reschedule</Text>
              <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                {selectedTaskIds.size} task{selectedTaskIds.size === 1 ? '' : 's'} selected
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.surface2, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Calendar */}
            <Calendar
              current={pickedDate}
              onDayPress={(day: any) => { setPickedDate(day.dateString); setPickedSlot(null); }}
              markedDates={markedDates}
              theme={{
                backgroundColor: 'transparent', calendarBackground: 'transparent',
                dayTextColor: colors.textPrimary, textDisabledColor: colors.textMuted,
                monthTextColor: colors.textPrimary, arrowColor: colors.accentPrimary,
                selectedDayBackgroundColor: colors.accentPrimary, selectedDayTextColor: isDark ? '#000000' : '#FFFFFF',
                todayTextColor: colors.accentPrimary, dotColor: colors.accentPrimary,
                textDayFontFamily: FONT_FAMILY.medium, textMonthFontFamily: FONT_FAMILY.bold,
              } as any}
              style={{ marginHorizontal: 8 }}
            />

            {/* Time Slot Picker */}
            <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
              {/* Section header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <Ionicons name="time-outline" size={16} color={colors.accentPrimary} style={{ marginRight: 8 }} />
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary }}>Time Slot</Text>
                <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.textTertiary, marginLeft: 8 }}>(optional)</Text>
              </View>

              {/* Existing tasks on this date */}
              {existingBlocks.length > 0 && (
                <View style={{ marginBottom: 12, padding: 10, backgroundColor: colors.accentDim, borderRadius: 10, borderWidth: 1, borderColor: colors.accentPrimary + '35' }}>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.accentPrimary, marginBottom: 6, letterSpacing: 0.5 }}>ALREADY ON {friendlyDate.toUpperCase()}</Text>
                  {existingBlocks.map((b, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <Ionicons name="ellipse" size={5} color={colors.accentPrimary} />
                      <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                        {b.title} <Text style={{ color: colors.textMuted }}>· {b.slot}</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* No slot option */}
              <TouchableOpacity
                onPress={() => setPickedSlot(null)}
                style={[
                  { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 10, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 8 },
                  pickedSlot === null
                    ? { backgroundColor: colors.accentDim, borderColor: colors.accentPrimary }
                    : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface2, borderColor: colors.border }
                ]}
              >
                <Ionicons
                  name={pickedSlot === null ? 'radio-button-on' : 'radio-button-off'}
                  size={16}
                  color={pickedSlot === null ? colors.accentPrimary : colors.textMuted}
                />
                <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 13, color: pickedSlot === null ? colors.textPrimary : colors.textTertiary }}>
                  Move date only — keep current time
                </Text>
              </TouchableOpacity>

              {/* Slot grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {RESCHEDULE_TIME_SLOTS.map(slot => {
                  const conflict = slotConflict(slot);
                  const isSel = pickedSlot === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      onPress={() => setPickedSlot(isSel ? null : slot)}
                      activeOpacity={0.7}
                      style={[
                        { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
                        isSel
                          ? { backgroundColor: colors.accentDim, borderColor: colors.accentPrimary }
                          : conflict
                          ? { backgroundColor: colors.errorBg, borderColor: colors.error + '50' }
                          : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface2, borderColor: colors.border }
                      ]}
                    >
                      <Text style={{
                        fontFamily: FONT_FAMILY.medium, fontSize: 11,
                        color: isSel ? colors.accentPrimary : conflict ? colors.error : colors.textSecondary
                      }}>
                        {slot}
                      </Text>
                      {/* Conflict task name shown under the slot */}
                      {conflict && !isSel && (
                        <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 9, color: colors.error, marginTop: 2 }} numberOfLines={1}>
                          {conflict}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Conflict warning banner if selected slot overlaps something */}
              {conflictOnSelected && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12, backgroundColor: colors.errorBg, borderRadius: 10, borderWidth: 1, borderColor: colors.error + '40' }}>
                  <Ionicons name="warning-outline" size={16} color={colors.error} />
                  <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.error, flex: 1 }}>
                    Conflicts with "{conflictOnSelected}" — you can still proceed
                  </Text>
                </View>
              )}
            </View>

            {/* Confirm button */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 }}>
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={saving}
                activeOpacity={0.85}
                style={{
                  backgroundColor: colors.accentPrimary, borderRadius: 14,
                  paddingVertical: 15, alignItems: 'center',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 15, color: isDark ? '#1a110a' : '#FFFFFF' }}>
                  {saving
                    ? 'Moving…'
                    : `Move to ${friendlyDate}${pickedSlot ? ` · ${pickedSlot.split('–')[0].trim()}` : ''}`
                  }
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
