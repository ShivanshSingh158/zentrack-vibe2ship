import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, ScrollView, Dimensions
} from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { triggerLayoutAnimation } from '../theme/animations';
import { auth } from '../services/firebase';
import { useMobileData } from '../contexts/MobileDataContext';
import { BlurView } from 'expo-blur';

const MODULES = [
  { id: 'Tasks', name: 'Tasks', icon: 'checkmark-circle', color: '#34C759' },
  { id: 'Calendar', name: 'Calendar', icon: 'calendar', color: '#FF3B30' },
  { id: 'Habits', name: 'Habits', icon: 'flame', color: '#FF9500' },
  { id: 'Gym', name: 'Gym Log', icon: 'barbell', color: '#32ADE6' },
  { id: 'Attendance', name: 'Attendance', icon: 'id-card', color: '#5856D6' },
  { id: 'Analytics', name: 'Analytics', icon: 'bar-chart', color: '#007AFF' },
  { id: 'Notes', name: 'Notes Vault', icon: 'document-text', color: '#FFD60A' },
  { id: 'Assignments', name: 'Assignments', icon: 'book', color: '#FF2D55' },
  { id: 'Grades', name: 'Grades', icon: 'calculator', color: '#4A4A4A' },
  { id: 'Learning', name: 'Learning', icon: 'library', color: '#00C7BE' },
];

export default function MoreScreen() {
  const navigation = useNavigation<any>();
  const { pinnedModules, setPinnedModules } = useMobileData();
  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const handleClose = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home');
    }
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', (e: any) => {
      if (navigation.isFocused()) {
        e.preventDefault();
        handleClose();
      }
    });
    return unsubscribe;
  }, [navigation, handleClose]);

  const toggleEdit = () => {
    triggerLayoutAnimation();
    if (isEditing) {
      setPinnedModules(selected);
    } else {
      setSelected(pinnedModules);
    }
    setIsEditing(!isEditing);
  };

  const navigateWithClose = (screenName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (screenName === 'Settings') {
      navigation.navigate('MoreStack', { screen: screenName });
    } else {
      navigation.navigate(screenName);
    }
  };

  const handleModulePress = (modId: string) => {
    if (isEditing) {
      triggerLayoutAnimation();
      if (selected.includes(modId)) {
        setSelected(selected.filter(m => m !== modId));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        if (selected.length < 5) {
          setSelected([...selected, modId]);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    } else {
      navigateWithClose(modId);
    }
  };

  const handleLogout = () => {
    auth.signOut().catch(console.error);
  };

  return (
    <View style={styles.root}>
      {/* Invisible backdrop to dismiss back to home */}
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={handleClose} />
      </View>
      
      {/* Bottom Sheet Modal with Glassmorphism */}
      <BlurView intensity={70} tint="dark" style={styles.sheet}>
        
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <View style={styles.headerIconBox}>
              <Ionicons name="grid" size={16} color={COLORS.accentPrimary} />
            </View>
            <Text style={styles.headerTitle}>All Modules</Text>
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
            <AnimatedPressable style={[styles.actionBtn, isEditing && { backgroundColor: COLORS.accentPrimary, borderColor: COLORS.accentPrimary }]} onPress={toggleEdit}>
              <Ionicons name={isEditing ? "checkmark" : "pencil"} size={18} color={isEditing ? COLORS.background : COLORS.textPrimary} />
            </AnimatedPressable>
            <AnimatedPressable style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.05)' }]} onPress={handleClose}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </AnimatedPressable>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Grid */}
          <View style={styles.grid}>
            {MODULES.filter(mod => isEditing || !pinnedModules.includes(mod.id)).map((mod) => {
              const isSelected = selected.includes(mod.id);
              const isDimmed = isEditing && !isSelected && selected.length >= 5;
              
              return (
                <AnimatedPressable
                  key={mod.id}
                  style={[styles.gridItem, { opacity: isDimmed ? 0.3 : 1 }]}
                  activeOpacity={0.7}
                  onPress={() => handleModulePress(mod.id)}
                >
                  <View style={[
                    styles.gridIconBox, 
                    isEditing && isSelected && { borderColor: COLORS.accentPrimary, borderWidth: 2 }
                  ]}>
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: mod.color, opacity: 0.15 }]} />
                    <Ionicons name={mod.icon as any} size={28} color={mod.color} />
                    {isEditing && isSelected && (
                      <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark" size={14} color={COLORS.background} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.gridItemText, isEditing && isSelected && { color: COLORS.textPrimary }]}>{mod.name}</Text>
                </AnimatedPressable>
              );
            })}

            {/* Settings & Profile */}
            <AnimatedPressable style={styles.gridItem} activeOpacity={0.7} onPress={() => navigateWithClose('Settings')}>
              <View style={styles.gridIconBox}>
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: COLORS.textMuted, opacity: 0.15 }]} />
                <Ionicons name="settings" size={28} color={COLORS.textMuted} />
              </View>
              <Text style={styles.gridItemText}>Settings</Text>
            </AnimatedPressable>

            {/* Logout */}
            <AnimatedPressable style={styles.gridItem} activeOpacity={0.7} onPress={handleLogout}>
              <View style={styles.gridIconBox}>
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: COLORS.error, opacity: 0.15 }]} />
                <Ionicons name="log-out" size={28} color={COLORS.error} />
              </View>
              <Text style={[styles.gridItemText, { color: COLORS.error }]}>Logout</Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)', // Darker backdrop for glass contrast
  },
  backdropTouch: {
    flex: 1,
  },
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
    backgroundColor: 'rgba(28, 28, 30, 0.4)', // Base tint beneath the blur
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.xxl,
  },
  headerIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(165, 153, 255, 0.15)', // Light tint of accent
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.title,
    fontSize: FONT_SIZE.lg,
    color: COLORS.textPrimary,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
  },
  gridItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: SPACE.lg,
  },
  gridIconBox: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden', // Ensures the absolute tint respects the border radius
  },
  gridItemText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACE.sm,
  },
  selectedBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.background, // Match dark background
  },
});
