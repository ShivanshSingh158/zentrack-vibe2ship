import React from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, SPACE } from '../../theme/tokens';
import { AttendanceSubject as Subject } from '../../contexts/MobileDataContext';
import { useTheme } from "../../contexts/ThemeContext";

interface TimetableModalProps {
  visible: boolean;
  onClose: () => void;
  subjects: Subject[];
  isImporting: boolean;
  handleImportTimetable: () => void;
  handleAddSubject: () => void;
  setEditSubject: (subject: Subject) => void;
  setShowAddModal: (show: boolean) => void;
  handleDeleteSubject: (id: string, name: string) => void;
  handleExportCSV: () => void;
  handleResetSemester: () => void;
}

export const TimetableModal = React.memo(({
  visible,
  onClose,
  subjects,
  isImporting,
  handleImportTimetable,
  handleAddSubject,
  setEditSubject,
  setShowAddModal,
  handleDeleteSubject,
  handleExportCSV,
  handleResetSemester,
}: TimetableModalProps) => {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  
  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.modalRoot}>
        <View style={{ padding: SPACE.xl, borderBottomWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: SPACE.md }}>
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 20, color: colors.textPrimary }}>Timetable</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => {
                  import('react-native').then(({ Alert }) => {
                    Alert.alert('Coming Soon', 'We are working on this feature! It will be available in a new update.');
                  });
                }}
                disabled={false}
                style={{ backgroundColor: 'rgba(165,153,255,0.15)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Ionicons name="scan" size={16} color={colors.accentPrimary} />
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.accentPrimary }}>Scan</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddSubject} style={{ backgroundColor: colors.accentPrimary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="add" size={16} color="#000" />
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#000' }}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        
        <FlatList
          data={subjects}
          keyExtractor={s => s.id!}
          contentContainerStyle={{ padding: SPACE.md }}
          renderItem={({ item: s }) => (
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: SPACE.lg, padding: SPACE.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.md }}>
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary }}>{s.name}</Text>
                <View style={{ flexDirection: 'row', gap: SPACE.md }}>
                  <TouchableOpacity onPress={() => { setEditSubject(s); setShowAddModal(true); }}>
                    <Ionicons name="pencil" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteSubject(s.id!, s.name)}>
                    <Ionicons name="trash" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: SPACE.xs }}>
                Target: <Text style={{ color: colors.textPrimary, fontWeight: 'bold' }}>{s.targetPercentage || 75}%</Text>
              </Text>
              <View style={{ flexDirection: 'row', gap: SPACE.lg }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  Classes: <Text style={{ color: colors.textPrimary }}>{s.classesAttended || 0}/{s.classesTotal || 0}</Text>
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  Labs: <Text style={{ color: colors.textPrimary }}>{s.labsAttended || 0}/{s.labsTotal || 0}</Text>
                </Text>
              </View>
            </View>
          )}
          ListFooterComponent={
            subjects.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.sm, marginBottom: 40 }}>
                <TouchableOpacity onPress={handleExportCSV} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name="download-outline" size={18} color="#10b981" />
                  <Text style={{ color: '#10b981', fontFamily: FONT_FAMILY.bold, fontSize: 14 }}>Export CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleResetSemester} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name="refresh-outline" size={18} color="#ef4444" />
                  <Text style={{ color: '#ef4444', fontFamily: FONT_FAMILY.bold, fontSize: 14 }}>Reset Semester</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </Modal>
  );
});

const makeStyles = (colors: any) => StyleSheet.create({
      modalRoot: { flex: 1, backgroundColor: colors.background },
    });
