import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, ScrollView,
} from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import AnimatedPressable from '../components/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { triggerLayoutAnimation } from '../theme/animations';
import { auth } from '../services/firebase';
import { useMobileData } from '../contexts/MobileDataContext';
import { BlurView } from 'expo-blur';
import { useTheme } from "../contexts/ThemeContext";
// Cap 7: BFE module ordering
import { getFingerprint } from '../services/saraMemory';
import { handleSyncError } from '../utils/errorUtils';


// ─── Module Categories ────────────────────────────────────────────────────────

type ModuleCategory = {
  label: string;
  icon: string;
  color: string;
  modules: ModuleDef[];
};

type ModuleDef = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

function getModuleCategories(colors: any) {
  return [
    {
      label: 'Productivity',
      icon: 'rocket-outline',
      color: colors.accentPrimary,
      modules: [
        { id: 'Tasks',    name: 'Tasks',       icon: 'checkmark-circle', color: '#34C759' },
        { id: 'Habits',   name: 'Habits',      icon: 'flame',            color: '#FF9500' },
        { id: 'Calendar', name: 'Calendar',    icon: 'calendar',         color: '#FF3B30' },
        { id: 'Notes',    name: 'Notes Vault', icon: 'document-text',    color: '#FFD60A' },
      ],
    },
    {
      label: 'Academic',
      icon: 'school-outline',
      color: colors.accentAmber,
      modules: [
        { id: 'Attendance',   name: 'Attendance',   icon: 'id-card',     color: '#5856D6' },
        { id: 'Assignments',  name: 'Assignments',  icon: 'book',        color: '#FF2D55' },
        { id: 'Grades',       name: 'Grades',       icon: 'calculator',  color: '#8E8E93' },
        { id: 'Learning',     name: 'Learning',     icon: 'library',     color: '#00C7BE' },
      ],
    },
    {
      label: 'Wellness',
      icon: 'heart-outline',
      color: colors.accentGreen,
      modules: [
        { id: 'Gym',      name: 'Gym Log',   icon: 'barbell', color: '#32ADE6' },
      ],
    },
    {
      label: 'Community',
      icon: 'people-outline',
      color: colors.accentSecondary,
      modules: [

      ],
    },
    {
      label: 'Analytics',
      icon: 'bar-chart-outline',
      color: colors.accentBlue,
      modules: [
        { id: 'Analytics', name: 'Analytics', icon: 'bar-chart', color: '#007AFF' },
      ],
    },
  ];
}

// Flat list for pinning logic
const ALL_MODULES: ModuleDef[] = [
  { id: 'Tasks',    name: 'Tasks',       icon: 'checkmark-circle', color: '#34C759' },
  { id: 'Habits',   name: 'Habits',      icon: 'flame',            color: '#FF9500' },
  { id: 'Calendar', name: 'Calendar',    icon: 'calendar',         color: '#FF3B30' },
  { id: 'Notes',    name: 'Notes Vault', icon: 'document-text',    color: '#FFD60A' },
  { id: 'Attendance',   name: 'Attendance',   icon: 'id-card',     color: '#5856D6' },
  { id: 'Assignments',  name: 'Assignments',  icon: 'book',        color: '#FF2D55' },
  { id: 'Grades',       name: 'Grades',       icon: 'calculator',  color: '#8E8E93' },
  { id: 'Learning',     name: 'Learning',     icon: 'library',     color: '#00C7BE' },
  { id: 'Gym',      name: 'Gym Log',   icon: 'barbell', color: '#32ADE6' },

  { id: 'Analytics', name: 'Analytics', icon: 'bar-chart', color: '#007AFF' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MoreScreen() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const MODULE_CATEGORIES = getModuleCategories(colors);
  const navigation = useNavigation<any>();
  const { pinnedModules, setPinnedModules } = useMobileData();
  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // Cap 7: BFE-ordered pinned modules
  const [bfeOrderedPins, setBfeOrderedPins] = useState<string[]>([]);
  const { user } = useMobileData();

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
      setPinnedModules(selected);
    } else {
      setSelected(pinnedModules);
    }
    setIsEditing(!isEditing);
  }, [isEditing, pinnedModules, selected, setPinnedModules]);

  // Cap 7 BFE logic removed as user requested not to show pinned modules in MoreScreen

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

  const handleLogout = useCallback(() => {
    auth.signOut().catch(console.warn);
  }, []);

  return (
    <View style={styles.root}>
      {/* Invisible backdrop to dismiss */}
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={handleClose} />
      </View>

      {/* Bottom Sheet */}
      <BlurView intensity={70} tint="dark" style={styles.sheet}>

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <View style={styles.headerIconBox}>
              <Ionicons name="grid" size={16} color={colors.accentPrimary} />
            </View>
            <Text style={styles.headerTitle}>All Modules</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
            <AnimatedPressable
              style={[styles.actionBtn, isEditing && { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary }]}
              onPress={toggleEdit}
            >
              <Ionicons
                name={isEditing ? 'checkmark' : 'pencil'}
                size={18}
                color={isEditing ? colors.background : colors.textPrimary}
              />
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.05)' }]}
              onPress={handleClose}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </AnimatedPressable>
          </View>
        </View>

        {isEditing && (
          <Text style={styles.editHint}>Tap up to 4 modules to pin to your home tabs</Text>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Removed Pinned Section */}

          {/* Unified Grid */}
          <View style={styles.grid}>
            {ALL_MODULES.filter(m => isEditing || !pinnedModules.includes(m.id)).map((mod, index) => {
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
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: mod.color, opacity: 0.14 }]} />
                    <Ionicons name={mod.icon as any} size={26} color={mod.color} />
                    {isEditing && isSelected && (
                      <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark" size={12} color={colors.background} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.gridItemText, isEditing && isSelected && { color: colors.textPrimary }]}>
                    {mod.name}
                  </Text>
                </AnimatedPressable>
              );
            })}

            {/* Utility Row: Settings */}
            <AnimatedPressable entering={FadeIn.delay(ALL_MODULES.length * 20).duration(200)} style={styles.gridItem} activeOpacity={0.7} haptic="none" onPress={() => navigateWithClose('Settings')}>
              <View style={styles.gridIconBox}>
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.textMuted, opacity: 0.12 }]} />
                <Ionicons name="settings" size={26} color={colors.textMuted} />
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

const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, justifyContent: 'flex-end' },
      backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
      backdropTouch: { flex: 1 },
      sheet: {
        borderTopLeftRadius: RADIUS.xxl,
        borderTopRightRadius: RADIUS.xxl,
        paddingHorizontal: SPACE.xl,
        paddingTop: SPACE.xl,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderBottomWidth: 0,
        maxHeight: '90%',
        overflow: 'hidden',
        backgroundColor: 'rgba(28, 28, 30, 0.4)',
      },

      headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACE.md,
      },
      headerIconBox: {
        width: 24, height: 24, borderRadius: 6,
        backgroundColor: 'rgba(165,153,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
      },
      headerTitle: {
        fontFamily: FONT_FAMILY.title,
        fontSize: FONT_SIZE.lg,
        color: colors.textPrimary,
      },
      actionBtn: {
        width: 36, height: 36, borderRadius: 18,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center',
      },

      editHint: {
        fontFamily: FONT_FAMILY.body,
        fontSize: FONT_SIZE.sm,
        color: colors.textTertiary,
        marginBottom: SPACE.lg,
        textAlign: 'center',
      },

      // ── Categories
      categorySection: { marginBottom: SPACE.xl },
      categoryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACE.xs,
        marginBottom: SPACE.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        paddingBottom: SPACE.xs,
      },
      categoryLabel: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 10,
        letterSpacing: 1,
        textTransform: 'uppercase',
      },

      // ── Grid
      grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
      gridItem: { width: '25%', alignItems: 'center', marginBottom: SPACE.lg },
      gridIconBox: {
        width: 58, height: 58, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
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
        borderWidth: 2, borderColor: colors.background,
      },
      // Cap 7: BFE section styles
      sectionLabel: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 11,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: colors.textMuted,
      },
      bfeHint: {
        fontFamily: FONT_FAMILY.body,
        fontSize: 10,
        color: colors.accentPrimary,
        opacity: 0.7,
      },
    });
