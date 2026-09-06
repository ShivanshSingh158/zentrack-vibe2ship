import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { BlurView } from 'expo-blur';

export interface LayoutItem {
  id: string;
  hidden: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  layout: LayoutItem[];
  setLayout: (l: LayoutItem[]) => void;
}

const WIDGET_NAMES: Record<string, string> = {
  quote: 'Daily Quote',
  stats: 'Stats Ribbon',
  xp: 'Level & XP',
  capture: 'Quick Capture',
  agenda: 'Today\'s Agenda',
};

export default function DashboardLayoutSheet({ visible, onClose, layout, setLayout }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const s = makeStyles(colors, insets);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newLayout = [...layout];
    const temp = newLayout[index];
    newLayout[index] = newLayout[index - 1];
    newLayout[index - 1] = temp;
    // Persistence is handled by the parent setLayout handler in useDashboardData.
    // Writing AsyncStorage here was a duplicate call (2 bridge calls per tap).
    setLayout(newLayout);
  };

  const moveDown = (index: number) => {
    if (index === layout.length - 1) return;
    const newLayout = [...layout];
    const temp = newLayout[index];
    newLayout[index] = newLayout[index + 1];
    newLayout[index + 1] = temp;
    setLayout(newLayout);
  };

  const toggleHidden = (index: number) => {
    const newLayout = [...layout];
    newLayout[index] = { ...newLayout[index], hidden: !newLayout[index].hidden };
    setLayout(newLayout);
  };

  const sheetContent = (
    <>
      <View style={s.header}>
        <Text style={s.title}>Customize Layout</Text>
        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <Text style={s.subtitle}>Move widgets to change their order on the Dashboard.</Text>

      <View style={s.list}>
        {layout.map((item, index) => (
          <View key={item.id} style={[s.row, item.hidden && { opacity: 0.5 }]}>
            <Text style={[s.rowText, item.hidden && { textDecorationLine: 'line-through' }]}>
              {WIDGET_NAMES[item.id] || item.id}
            </Text>
            <View style={s.actions}>
              <TouchableOpacity onPress={() => toggleHidden(index)} style={s.iconBtn}>
                <Ionicons name={item.hidden ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={s.vertDivider} />
              <TouchableOpacity onPress={() => moveUp(index)} disabled={index === 0} style={s.iconBtn}>
                <Ionicons name="arrow-up" size={20} color={index === 0 ? colors.border : colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => moveDown(index)} disabled={index === layout.length - 1} style={s.iconBtn}>
                <Ionicons name="arrow-down" size={20} color={index === layout.length - 1 ? colors.border : colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent>
      {/* BlurView is GPU-accelerated on iOS. On Android it recalculates blur
          on every animation frame during the native modal slide, causing jank.
          Use a plain opaque overlay on Android instead. */}
      {Platform.OS === 'ios' ? (
        <BlurView intensity={isDark ? 50 : 20} tint={isDark ? 'dark' : 'light'} style={s.overlay}>
          <TouchableOpacity style={{ flex: 1, width: '100%' }} activeOpacity={1} onPress={onClose} />
          <View style={s.sheet}>
            {sheetContent}
          </View>
        </BlurView>
      ) : (
        <View style={[s.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.45)' }]}>
          <TouchableOpacity style={{ flex: 1, width: '100%' }} activeOpacity={1} onPress={onClose} />
          <View style={s.sheet}>
            {sheetContent}
          </View>
        </View>
      )}
    </Modal>
  );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    padding: SPACE.xl,
    paddingBottom: Math.max(insets.bottom + SPACE.sm, SPACE.lg),
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
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
  list: {
    gap: SPACE.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.base,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  iconBtn: {
    paddingVertical: SPACE.xs,
  },
  vertDivider: {
    width: 1,
    height: 16,
    backgroundColor: colors.border,
    marginHorizontal: SPACE.xs,
  }
});
