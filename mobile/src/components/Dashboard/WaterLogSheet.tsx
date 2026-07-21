import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { BlurView } from 'expo-blur';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import * as Haptics from 'expo-haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  target: number;
  onUpdateTarget: (val: number) => void;
}

export default function WaterLogSheet({ visible, onClose, userId, target, onUpdateTarget }: Props) {
  const { colors, isDark } = useTheme();
  const s = makeStyles(colors);

  const [editingTarget, setEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState(String(target));

  React.useEffect(() => { setTempTarget(String(target)); }, [target]);

  const handleSaveTarget = () => {
    const val = parseInt(tempTarget, 10);
    if (!isNaN(val) && val > 0) onUpdateTarget(val);
    setEditingTarget(false);
  };

  const handleLog = async (amountMl: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const todayStr = new Date().toISOString().split('T')[0];
    
    try {
      await addDoc(collection(db, COLLECTION.WATER_LOGS), {
        userId,
        date: todayStr,
        amountMl,
        timestamp: Date.now()
      });
      onClose();
    } catch (e) {
      console.error('Error logging water', e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <BlurView intensity={isDark ? 50 : 20} tint={isDark ? "dark" : "light"} style={s.overlay}>
        <TouchableOpacity style={{ flex: 1, width: '100%' }} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>Log Water</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={s.subtitle}>Stay hydrated! How much water did you just drink?</Text>

          <View style={s.grid}>
            {[
              { amount: 250, label: 'Glass', icon: 'water-outline' },
              { amount: 500, label: 'Bottle', icon: 'flask-outline' },
              { amount: 1000, label: 'Liter', icon: 'pint-outline' }
            ].map(item => (
              <TouchableOpacity key={item.amount} style={s.card} onPress={() => handleLog(item.amount)}>
                <View style={s.iconWrap}>
                  <Ionicons name={item.icon as any} size={32} color="#0A84FF" />
                </View>
                <Text style={s.amountText}>{item.amount} ml</Text>
                <Text style={s.labelText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.footer}>
            <Text style={s.footerText}>Daily Goal: </Text>
            {editingTarget ? (
              <View style={s.editRow}>
                <TextInput
                  style={[s.input, { color: colors.textPrimary }]}
                  value={tempTarget}
                  onChangeText={setTempTarget}
                  keyboardType="number-pad"
                  autoFocus
                />
                <TouchableOpacity style={s.saveBtn} onPress={handleSaveTarget}>
                  <Text style={s.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditingTarget(true)}>
                <Text style={s.targetText}>{target} ml  <Ionicons name="pencil" size={14} color="#0A84FF" /></Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    padding: SPACE.xl,
    paddingBottom: SPACE.xxl * 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.sm,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xl,
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: SPACE.xs,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
    marginBottom: SPACE.xl,
  },
  grid: {
    flexDirection: 'row',
    gap: SPACE.md,
    justifyContent: 'space-between',
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.xl,
    padding: SPACE.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(10, 132, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.sm,
  },
  amountText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.base,
    color: colors.textPrimary,
  },
  labelText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  footer: {
    marginTop: SPACE.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
  },
  targetText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: '#0A84FF',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: '#0A84FF',
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    padding: 0,
    minWidth: 60,
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: '#0A84FF',
    paddingHorizontal: SPACE.md,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  saveBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: '#fff',
  }
});
