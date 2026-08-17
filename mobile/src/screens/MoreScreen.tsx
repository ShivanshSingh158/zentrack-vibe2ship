import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, ScrollView,
} from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import AnimatedPressable from '../components/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { triggerLayoutAnimation } from '../theme/animations';
import { performSignOut } from '../contexts/domains/CoreDataContext';
import { useMobileData } from '../contexts/MobileDataContext';
import { BlurView } from 'expo-blur';
import { useTheme } from "../contexts/ThemeContext";

// ─── Module Definitions ───────────────────────────────────────────────────────

type ModuleDef = {
  id: string;
  name: string;
  icon: string;
  colorDark: string;
  colorLight: string;
};

const ALL_MODULES_DEF: ModuleDef[] = [
  { id: 'Tasks',       name: 'Tasks',       icon: 'checkmark-circle', colorDark: '#34C759', colorLight: '#059669' },
  { id: 'Habits',      name: 'Habits',      icon: 'flame',            colorDark: '#FF9500', colorLight: '#D97706' },
  { id: 'Calendar',    name: 'Calendar',    icon: 'calendar',         colorDark: '#FF3B30', colorLight: '#DC2626' },
  { id: 'Notes',       name: 'Notes Vault', icon: 'document-text',    colorDark: '#FFD60A', colorLight: '#D97706' },
  { id: 'Attendance',  name: 'Attendance',  icon: 'id-card',          colorDark: '#5856D6', colorLight: '#6C5CE7' },
  { id: 'Assignments', name: 'Assignments', icon: 'book',             colorDark: '#FF2D55', colorLight: '#0284C7' },
  { id: 'Grades',      name: 'Grades',      icon: 'calculator',       colorDark: '#8E8E93', colorLight: '#6C5CE7' },
  { id: 'Learning',    name: 'Learning',    icon: 'library',          colorDark: '#00C7BE', colorLight: '#0284C7' },
  { id: 'Gym',         name: 'Gym Log',     icon: 'barbell',          colorDark: '#32ADE6', colorLight: '#D97706' },
  { id: 'Analytics',   name: 'Analytics',   icon: 'bar-chart',        colorDark: '#007AFF', colorLight: '#0284C7' },
];

const DEFAULT_PINNED_MODULES = ['Tasks', 'Gym', 'Calendar', 'Attendance'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);
  const navigation = useNavigation<any>();
  const { pinnedModules, setPinnedModules } = useMobileData();
  const effectivePinned = useMemo(() => {
    return (pinnedModules && pinnedModules.length > 0) ? pinnedModules : DEFAULT_PINNED_MODULES;
  }, [pinnedModules]);

  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(effectivePinned);

  useEffect(() => {
    if (!isEditing) {
      setSelected(effectivePinned);
    }
  }, [effectivePinned, isEditing]);

  const handleClose = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home');
    }
  }, [navigation]);

  const toggleEdit = useCallback(() => {
    triggerLayoutAnimation();
    if (isEditing) {
      setPinnedModules(selected.length > 0 ? selected : DEFAULT_PINNED_MODULES);
    } else {
      setSelected(effectivePinned);
    }
    setIsEditing(!isEditing);
  }, [isEditing, effectivePinned, selected, setPinnedModules]);

  const navigateWithClose = useCallback((screenName: string) => {
    if (screenName === 'Settings') {
      navigation.navigate('MoreStack', { screen: screenName });
    } else {
      navigation.navigate(screenName);
    }
  }, [navigation]);

  const handleModulePress = useCallback((modId: string) => {
    if (isEditing) {
      triggerLayoutAnimation();
      if (selected.includes(modId)) {
        setSelected(selected.filter(m => m !== modId));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        if (selected.length < 4) {
          setSelected([...selected, modId]);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    } else {
      navigateWithClose(modId);
    }
  }, [isEditing, selected, navigateWithClose]);

  const allModules = useMemo(() => {
    return ALL_MODULES_DEF.map(m => ({
      id: m.id,
      name: m.name,
      icon: m.icon,
      color: isDark ? m.colorDark : m.colorLight,
    }));
  }, [isDark]);

  return (
    <View style={styles.root}>
      {/* Invisible backdrop to dismiss */}
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={handleClose} />
      </View>

      {/* Bottom Sheet */}
      <BlurView intensity={isDark ? 70 : 95} tint={isDark ? "dark" : "light"} style={styles.sheet}>

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <View style={styles.headerIconBox}>
              <Ionicons name="grid" size={16} color={colors.accentPrimary} />
            </View>
            <Text style={styles.headerTitle}>All Modules</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <AnimatedPressable
              style={[
                styles.editPillBtn,
                isEditing && { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
              ]}
              onPress={toggleEdit}
              haptic="light"
            >
              <Ionicons
                name={isEditing ? 'checkmark' : 'pencil'}
                size={14}
                color={isEditing ? (isDark ? '#000000' : '#FFFFFF') : colors.textPrimary}
              />
              <Text
                style={[
                  styles.editPillText,
                  { color: isEditing ? (isDark ? '#000000' : '#FFFFFF') : colors.textPrimary },
                ]}
              >
                {isEditing ? 'Done' : 'Edit Nav'}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.actionBtn}
              onPress={handleClose}
              haptic="light"
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </AnimatedPressable>
          </View>
        </View>

        {isEditing && (
          <Text style={styles.editHint}>Tap up to 4 modules to pin to your home tabs</Text>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Unified Grid */}
          <View style={styles.grid}>
            {allModules.filter(m => isEditing || !effectivePinned.includes(m.id)).map((mod, index) => {
              const isSelected = selected.includes(mod.id);
              const isDimmed = isEditing && !isSelected && selected.length >= 4;
              return (
                <AnimatedPressable
                  entering={FadeIn.delay(index * 20).duration(200)}
                  key={mod.id}
                  style={[styles.gridItem, { opacity: isDimmed ? 0.3 : 1 }]}
                  activeOpacity={0.7}
                  haptic="none"
                  onPress={() => handleModulePress(mod.id)}
                >
                  <View style={[
                    styles.gridIconBox,
                    isEditing && isSelected && { borderColor: colors.accentPrimary, borderWidth: 2 },
                  ]}>
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: mod.color, opacity: isDark ? 0.14 : 0.10 }]} />
                    <Ionicons name={mod.icon as any} size={26} color={mod.color} />
                    {isEditing && isSelected && (
                      <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark" size={12} color={isDark ? '#000000' : '#FFFFFF'} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.gridItemText, isEditing && isSelected && { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold }]}>
                    {mod.name}
                  </Text>
                </AnimatedPressable>
              );
            })}

            {/* Utility Row: Settings */}
            <AnimatedPressable entering={FadeIn.delay(allModules.length * 20).duration(200)} style={styles.gridItem} activeOpacity={0.7} haptic="none" onPress={() => navigateWithClose('Settings')}>
              <View style={styles.gridIconBox}>
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? colors.textMuted : '#636366', opacity: isDark ? 0.12 : 0.08 }]} />
                <Ionicons name="settings" size={26} color={isDark ? colors.textMuted : '#636366'} />
              </View>
              <Text style={styles.gridItemText}>Settings</Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      </BlurView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)' },
  backdropTouch: { flex: 1 },
  sheet: {
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.xl,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E1EA',
    borderBottomWidth: 0,
    maxHeight: '90%',
    overflow: 'hidden',
    backgroundColor: isDark ? 'rgba(28, 28, 30, 0.4)' : '#FFFFFF',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  headerIconBox: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.title,
    fontSize: FONT_SIZE.lg,
    color: colors.textPrimary,
  },
  actionBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E1EA',
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F0EFF7',
    alignItems: 'center', justifyContent: 'center',
  },
  editPillBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E1EA',
    backgroundColor: isDark ? (colors.surface2 || colors.surface) : '#F0EFF7',
  },
  editPillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    letterSpacing: 0.2,
  },

  editHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.textTertiary,
    marginBottom: SPACE.lg,
    textAlign: 'center',
  },

  // ── Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  gridItem: { width: '25%', alignItems: 'center', marginBottom: SPACE.lg },
  gridIconBox: {
    width: 58, height: 58, borderRadius: 18,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#E2E1EA',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    elevation: isDark ? 0 : 1,
    shadowColor: isDark ? '#000000' : 'rgba(0,0,0,0.04)',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: isDark ? 0 : 0.5,
  },
  gridItemText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: SPACE.sm,
  },
  selectedBadge: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: isDark ? colors.background : '#FFFFFF',
  },
});
