import React, { useCallback, useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import Reanimated, { 
  FadeIn, 
  FadeOut
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedPressable from '../components/AnimatedPressable';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import { triggerLayoutAnimation } from '../theme/animations';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { BlurView } from 'expo-blur';
import { useTheme } from "../contexts/ThemeContext";
import { DynamicCalendarIcon } from '../components/ui/DynamicCalendarIcon';
import { prefetchRemainingModules } from '../utils/ModulePrefetcher';

// ─── Module Definitions ───────────────────────────────────────────────────────

type ModuleDef = {
  id: string;
  name: string;
  icon: string;
  iconSet?: 'ionicons' | 'mci';
  colorDark: string;
  colorLight: string;
};

const ALL_MODULES_DEF: ModuleDef[] = [
  { id: 'Tasks',       name: 'Tasks',       icon: 'checkmark-circle', colorDark: '#34C759', colorLight: '#059669' },
  { id: 'Habits',      name: 'Habits',      icon: 'sync',             colorDark: '#FF9500', colorLight: '#D97706' },
  { id: 'Calendar',    name: 'Calendar',    icon: 'calendar-number',  colorDark: '#FF453A', colorLight: '#DC2626' },
  { id: 'Notes',       name: 'Notes Vault', icon: 'folder',           colorDark: '#FFD60A', colorLight: '#D97706' },
  { id: 'Attendance',  name: 'Attendance',  icon: 'id-card',          colorDark: '#5856D6', colorLight: '#6C5CE7' },
  { id: 'Assignments', name: 'Assignments', icon: 'clipboard',        colorDark: '#A855F7', colorLight: '#7C3AED' },
  { id: 'Grades',      name: 'Grades',      icon: 'calculator',       colorDark: '#8E8E93', colorLight: '#6C5CE7' },
  { id: 'Learning',    name: 'Learning',    icon: 'library',          colorDark: '#00C7BE', colorLight: '#0284C7' },
  { id: 'Gym',         name: 'Gym Log',     icon: 'arm-flex', iconSet: 'mci', colorDark: '#32ADE6', colorLight: '#0284C7' },
  { id: 'Analytics',   name: 'Analytics',   icon: 'bar-chart',        colorDark: '#007AFF', colorLight: '#0284C7' },
];

const DEFAULT_PINNED_MODULES = ['Tasks', 'Gym', 'Calendar', 'Attendance'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, isDark, insets), [colors, isDark, insets.top, insets.bottom]);
  const navigation = useNavigation<any>();
  const { pinnedModules, setPinnedModules } = useCoreData();

  const effectivePinned = useMemo(() => {
    return (pinnedModules && pinnedModules.length > 0) ? pinnedModules : DEFAULT_PINNED_MODULES;
  }, [pinnedModules]);

  // Warm remaining unpinned screens immediately when user enters More screen
  useEffect(() => {
    prefetchRemainingModules();
  }, []);

  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => effectivePinned);

  const handleClose = useCallback(() => {
    if (isEditing) {
      setIsEditing(false);
      setSelected(effectivePinned);
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home');
    }
  }, [navigation, isEditing, effectivePinned]);

  const toggleEdit = useCallback(() => {
    if (isEditing) {
      const toSave = selected.length > 0 ? selected : DEFAULT_PINNED_MODULES;
      setPinnedModules(toSave);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEditing(false);
    } else {
      triggerLayoutAnimation();
      setSelected(effectivePinned);
      setIsEditing(true);
    }
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
      if (selected.includes(modId)) {
        setSelected(prev => prev.filter(m => m !== modId));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        if (selected.length < 4) {
          setSelected(prev => [...prev, modId]);
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
      iconSet: m.iconSet,
      color: isDark ? m.colorDark : m.colorLight,
    }));
  }, [isDark]);

  return (
    <View style={styles.root}>
      {/* Fast, non-bouncy backdrop */}
      <Reanimated.View 
        entering={FadeIn.duration(120)} 
        exiting={FadeOut.duration(80)} 
        style={styles.backdrop}
      >
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={handleClose} />
      </Reanimated.View>

      {/* Floating Island Card — Fast, instant module fade matching tab navigation */}
      <Reanimated.View 
        entering={FadeIn.duration(120)}
        exiting={FadeOut.duration(80)}
        style={styles.cardWrapper}
        renderToHardwareTextureAndroid={true}
        shouldRasterizeIOS={true}
      >
        <BlurView intensity={isDark ? 85 : 95} tint={isDark ? "dark" : "light"} style={styles.sheet}>

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
                  name={isEditing ? 'checkmark-circle' : 'pencil'}
                  size={13}
                  color={isEditing ? (isDark ? '#000000' : '#FFFFFF') : colors.textPrimary}
                />
                <Text
                  style={[
                    styles.editPillText,
                    { 
                      color: isEditing ? (isDark ? '#000000' : '#FFFFFF') : colors.textPrimary,
                      fontFamily: isEditing ? FONT_FAMILY.bold : FONT_FAMILY.medium,
                    },
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
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </AnimatedPressable>
            </View>
          </View>

          {isEditing && (
            <Text style={styles.editHint}>Select up to 4 modules to pin to your navigation bar</Text>
          )}

          <ScrollView 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={{ paddingBottom: SPACE.sm }}
            bounces={false}
          >
            {/* Unified Grid */}
            <View style={styles.grid}>
              {allModules.filter(m => isEditing || !effectivePinned.includes(m.id)).map((mod) => {
                const isSelected = selected.includes(mod.id);
                const isDimmed = isEditing && !isSelected && selected.length >= 4;
                return (
                  <AnimatedPressable
                    key={mod.id}
                    style={[styles.gridItem, { opacity: isDimmed ? 0.35 : 1 }]}
                    activeOpacity={0.7}
                    haptic="none"
                    onPress={() => handleModulePress(mod.id)}
                  >
                    <View style={{ position: 'relative' }}>
                      <View style={[
                        styles.gridIconBox,
                        isEditing && isSelected && { borderColor: colors.accentPrimary, borderWidth: 2 },
                      ]}>
                        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: mod.color, opacity: isDark ? 0.16 : 0.12 }]} />
                        {mod.id === 'Calendar' ? (
                          <DynamicCalendarIcon size={26} color={mod.color} />
                        ) : mod.iconSet === 'mci' ? (
                          <MaterialCommunityIcons name={mod.icon as any} size={26} color={mod.color} />
                        ) : (
                          <Ionicons name={mod.icon as any} size={26} color={mod.color} />
                        )}
                      </View>

                      {isEditing && isSelected && (
                        <View style={styles.selectedBadge}>
                          <Text style={styles.selectedBadgeText}>
                            {selected.indexOf(mod.id) + 1}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text 
                      style={[styles.gridItemText, isEditing && isSelected && { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold }]}
                      numberOfLines={2}
                    >
                      {mod.name}
                    </Text>
                  </AnimatedPressable>
                );
              })}

              {/* Utility Row: Settings (only visible when not editing navigation pins) */}
              {!isEditing && (
                <AnimatedPressable style={styles.gridItem} activeOpacity={0.7} haptic="none" onPress={() => navigateWithClose('Settings')}>
                  <View style={styles.gridIconBox}>
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? colors.textMuted : '#636366', opacity: isDark ? 0.14 : 0.10 }]} />
                    <Ionicons name="settings" size={26} color={isDark ? colors.textMuted : '#636366'} />
                  </View>
                  <Text style={styles.gridItemText} numberOfLines={1}>Settings</Text>
                </AnimatedPressable>
              )}
            </View>
          </ScrollView>
        </BlurView>
      </Reanimated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: any, isDark: boolean = true, insets: any = { bottom: 0 }) => StyleSheet.create({
  root: { 
    flex: 1, 
    justifyContent: 'flex-end',
  },
  backdrop: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.3)' 
  },
  backdropTouch: { flex: 1 },
  cardWrapper: {
    marginHorizontal: 2,
    marginBottom: Math.max(insets.bottom, 8) + 54,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: isDark ? 0.7 : 0.2,
    shadowRadius: 24,
    elevation: 20,
  },
  sheet: {
    borderRadius: 24,
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.xs,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    maxHeight: 440,
    overflow: 'hidden',
    backgroundColor: isDark ? 'rgba(16, 16, 20, 0.94)' : 'rgba(255, 255, 255, 0.96)',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
    paddingHorizontal: SPACE.xs,
  },
  headerIconBox: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: isDark ? 'rgba(165,153,255,0.18)' : 'rgba(108,92,231,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.title,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
  },
  actionBtn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F0EFF7',
    alignItems: 'center', justifyContent: 'center',
  },
  editPillBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    backgroundColor: isDark ? (colors.surface2 || 'rgba(30,30,35,0.8)') : '#F0EFF7',
  },
  editPillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11.5,
    letterSpacing: 0.1,
  },

  editHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: colors.textTertiary,
    marginBottom: SPACE.md,
    textAlign: 'center',
  },

  // ── Grid
  grid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    justifyContent: 'flex-start',
    paddingTop: SPACE.xs,
  },
  gridItem: { 
    width: '25%', 
    alignItems: 'center', 
    marginBottom: SPACE.md 
  },
  gridIconBox: {
    width: 58, 
    height: 58, 
    borderRadius: 18,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    alignItems: 'center', 
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gridItemText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: SPACE.xs,
    lineHeight: 13,
    paddingHorizontal: 2,
  },
  selectedBadge: {
    position: 'absolute', 
    top: -5, 
    right: -5,
    width: 22, 
    height: 22, 
    borderRadius: 11,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: isDark ? '#1C1C1E' : '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 20,
  },
  selectedBadgeText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
    color: isDark ? '#000000' : '#FFFFFF',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
