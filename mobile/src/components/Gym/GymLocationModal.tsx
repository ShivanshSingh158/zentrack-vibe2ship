/**
 * GymLocationModal.tsx — ZenTrack Mobile
 *
 * Luxury obsidian-cosmos bottom sheet for configuring Gym Geofencing, GPS coordinates,
 * trigger radius, and auto-workout prompt automation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, StyleSheet, Switch, Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import BottomSheet from '../ui/BottomSheet';
import AnimatedPressable from '../AnimatedPressable';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY } from '../../theme/tokens';
import {
  getGymGeofenceConfig,
  saveGymGeofenceConfig,
  deleteGymGeofenceConfig,
  getCurrentDeviceCoords,
  searchAddressLocations,
  savePlace,
} from '../../services/savedPlacesService';
import { syncAllActiveGeofences, requestLocationPermissions } from '../../services/geofenceService';
import type { GymGeofenceConfig } from '../../types/locationReminder.types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const RADIUS_OPTIONS = [50, 100, 150, 250, 500];

export const GymLocationModal = React.memo(function GymLocationModal({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [locatingCurrent, setLocatingCurrent] = useState(false);

  // Form State
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(150);
  const [promptOnEnter, setPromptOnEnter] = useState(true);
  const [promptOnExit, setPromptOnExit] = useState(true);
  const [isEnabled, setIsEnabled] = useState(true);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Load existing configuration
  useEffect(() => {
    if (!visible) return;
    getGymGeofenceConfig().then(cfg => {
      if (cfg) {
        setPlaceName(cfg.placeName || '');
        setLatitude(cfg.latitude);
        setLongitude(cfg.longitude);
        setRadius(cfg.radius || 150);
        setPromptOnEnter(cfg.promptOnEnter ?? true);
        setPromptOnExit(cfg.promptOnExit ?? true);
        setIsEnabled(cfg.enabled ?? true);
      }
    });
  }, [visible]);

  // 1. Set to Current Device Location
  const handleUseCurrentLocation = useCallback(async () => {
    setLocatingCurrent(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      setLocatingCurrent(false);
      Alert.alert(
        'Location Permission Needed',
        'Please allow ZenTrack to access location (Always/Background) to enable automatic workout detection.'
      );
      return;
    }

    const coords = await getCurrentDeviceCoords();
    setLocatingCurrent(false);

    if (coords) {
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
      setAddress(coords.address || '');
      setPlaceName(coords.name || 'My Gym');
      setSearchResults([]);
      setSearchQuery('');
      Keyboard.dismiss();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Alert.alert('GPS Error', 'Could not fetch current GPS location. Please ensure Location is enabled.');
    }
  }, []);

  // 2. Search Address / Place
  const handleSearch = useCallback(async (text: string) => {
    setSearchQuery(text);
    if (text.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const results = await searchAddressLocations(text);
    setSearchResults(results);
    setSearching(false);
  }, []);

  const handleSelectSearchResult = useCallback((res: any) => {
    setLatitude(res.latitude);
    setLongitude(res.longitude);
    setPlaceName(res.name || 'My Gym');
    setAddress(res.address || '');
    setSearchResults([]);
    setSearchQuery('');
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // 3. Save Configuration
  const handleSave = useCallback(async () => {
    if (!latitude || !longitude) {
      Alert.alert('Location Required', 'Please set your gym location using current GPS or place search.');
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const config: GymGeofenceConfig = {
      enabled: isEnabled,
      placeName: placeName.trim() || 'My Gym',
      latitude,
      longitude,
      radius,
      promptOnEnter,
      promptOnExit,
      updatedAt: Date.now(),
    };

    await saveGymGeofenceConfig(config);

    // Also register in Saved Places
    await savePlace({
      id: 'place_gym_primary',
      name: placeName.trim() || 'My Gym',
      category: 'gym',
      latitude,
      longitude,
      address,
      radius,
    });

    await syncAllActiveGeofences();
    setLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  }, [latitude, longitude, isEnabled, placeName, radius, promptOnEnter, promptOnExit, address, onClose]);

  // 4. Delete / Reset Configuration
  const handleDeleteGeofence = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Remove Gym Geofence',
      'Are you sure you want to remove your gym location? Automatic workout detection will be disabled.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            await deleteGymGeofenceConfig();
            await syncAllActiveGeofences();
            setLatitude(null);
            setLongitude(null);
            setPlaceName('');
            setAddress('');
            setLoading(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onClose();
          },
        },
      ]
    );
  }, [onClose]);

  const hasLocationSet = latitude !== null && longitude !== null;

  return (
    <BottomSheet visible={visible} onClose={onClose} contentStyle={styles.sheetContent}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIconBadge, { backgroundColor: 'rgba(165, 153, 255, 0.12)', borderColor: 'rgba(165, 153, 255, 0.25)' }]}>
              <Ionicons name="barbell-outline" size={18} color="#a599ff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Gym Geofence</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>Automate workout detection & logging</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: isDark ? '#141418' : '#F3F4F6' }]}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Location Search Bar with GPS Button */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>GYM LOCATION SPOT</Text>
          <View style={[styles.searchBox, { backgroundColor: isDark ? '#0d0d10' : '#F3F4F6', borderColor: isDark ? '#1c1c20' : '#E5E7EB' }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={handleSearch}
              placeholder="Search address or gym..."
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.textPrimary }]}
            />
            {searching ? (
              <ActivityIndicator size="small" color="#a599ff" />
            ) : (
              <TouchableOpacity
                onPress={handleUseCurrentLocation}
                disabled={locatingCurrent}
                style={[styles.gpsInlineBtn, { backgroundColor: 'rgba(165, 153, 255, 0.12)' }]}
              >
                {locatingCurrent ? (
                  <ActivityIndicator size="small" color="#a599ff" style={{ transform: [{ scale: 0.7 }] }} />
                ) : (
                  <>
                    <Ionicons name="navigate" size={12} color="#a599ff" />
                    <Text style={styles.gpsInlineText}>GPS</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Search Dropdown */}
          {searchResults.length > 0 && (
            <View style={[styles.resultsList, { backgroundColor: isDark ? '#0d0d10' : '#FFFFFF', borderColor: isDark ? '#1c1c20' : '#E5E7EB' }]}>
              {searchResults.map((item, idx) => (
                <TouchableOpacity
                  key={`res_${idx}`}
                  onPress={() => handleSelectSearchResult(item)}
                  style={[styles.resultItem, { borderBottomColor: isDark ? '#16161a' : '#F3F4F6' }]}
                >
                  <Ionicons name="location-outline" size={16} color="#a599ff" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>{item.name}</Text>
                    <Text style={[styles.resultAddress, { color: colors.textMuted }]} numberOfLines={1}>{item.address}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Selected Gym Card */}
        {hasLocationSet && (
          <View style={[styles.statusCard, { backgroundColor: 'rgba(165, 153, 255, 0.06)', borderColor: 'rgba(165, 153, 255, 0.28)' }]}>
            <View style={styles.statusCardHeader}>
              <View style={styles.placeTitleRow}>
                <Ionicons name="location" size={16} color="#a599ff" />
                <TextInput
                  value={placeName}
                  onChangeText={setPlaceName}
                  placeholder="Gym Name (e.g. Gold's Gym)"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.placeTitleInput, { color: colors.textPrimary }]}
                  numberOfLines={1}
                />
              </View>
              <View style={styles.statusHeaderRight}>
                <View style={[styles.activeBadge, { backgroundColor: 'rgba(94, 218, 158, 0.12)', borderColor: 'rgba(94, 218, 158, 0.3)' }]}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeBadgeText}>Configured</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setLatitude(null);
                    setLongitude(null);
                    setPlaceName('');
                    setAddress('');
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.cardTrashBtn}
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            {address ? <Text style={[styles.addressText, { color: colors.textMuted }]} numberOfLines={2}>{address}</Text> : null}
            <Text style={styles.coordsText}>
              {latitude?.toFixed(4)}, {longitude?.toFixed(4)} • {radius}m Geofence
            </Text>
          </View>
        )}

        {/* Radius Selector */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>GEOFENCE TRIGGER RADIUS</Text>
          <View style={styles.radiusRow}>
            {RADIUS_OPTIONS.map(r => {
              const isSelected = radius === r;
              return (
                <AnimatedPressable
                  key={`r_${r}`}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRadius(r); }}
                  style={[
                    styles.radiusPill,
                    isSelected
                      ? { backgroundColor: 'rgba(165, 153, 255, 0.16)', borderColor: '#a599ff' }
                      : { backgroundColor: isDark ? '#0d0d10' : '#F3F4F6', borderColor: isDark ? '#1c1c20' : '#E5E7EB' },
                  ]}
                >
                  <Text style={[styles.radiusPillText, { color: isSelected ? '#a599ff' : colors.textMuted, fontWeight: isSelected ? '600' : '400' }]}>
                    {r}m {r === 150 ? '★' : ''}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>

        {/* Automation Settings (Unified Settings Card) */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>AUTOMATION RULES</Text>
          <View style={[styles.settingsGroupCard, { backgroundColor: isDark ? '#0d0d10' : '#F9FAFB', borderColor: isDark ? '#1c1c20' : '#E5E7EB' }]}>
            {/* Row 1: Arrival */}
            <View style={styles.settingRow}>
              <View style={[styles.settingIconBadge, { backgroundColor: 'rgba(94, 218, 158, 0.12)' }]}>
                <Ionicons name="log-in-outline" size={16} color="#5eda9e" />
              </View>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>Prompt on Arrival</Text>
                <Text style={[styles.settingDesc, { color: colors.textMuted }]}>Alerts you to start your workout when entering gym</Text>
              </View>
              <Switch
                value={promptOnEnter}
                onValueChange={val => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPromptOnEnter(val);
                }}
                trackColor={{ false: isDark ? '#1c1c20' : '#E5E7EB', true: '#a599ff' }}
                thumbColor={promptOnEnter ? '#ffffff' : isDark ? '#8e8e93' : '#ffffff'}
              />
            </View>

            <View style={[styles.settingDivider, { backgroundColor: isDark ? '#16161a' : '#E5E7EB' }]} />

            {/* Row 2: Departure */}
            <View style={styles.settingRow}>
              <View style={[styles.settingIconBadge, { backgroundColor: 'rgba(165, 153, 255, 0.12)' }]}>
                <Ionicons name="log-out-outline" size={16} color="#a599ff" />
              </View>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>Prompt on Departure</Text>
                <Text style={[styles.settingDesc, { color: colors.textMuted }]}>Prompts to review and save summary when leaving</Text>
              </View>
              <Switch
                value={promptOnExit}
                onValueChange={val => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPromptOnExit(val);
                }}
                trackColor={{ false: isDark ? '#1c1c20' : '#E5E7EB', true: '#a599ff' }}
                thumbColor={promptOnExit ? '#ffffff' : isDark ? '#8e8e93' : '#ffffff'}
              />
            </View>
          </View>
        </View>

        {/* Footer Actions */}
        <View style={styles.footerActions}>
          <AnimatedPressable
            onPress={handleSave}
            disabled={loading || !hasLocationSet}
            style={[
              styles.saveBtn,
              { opacity: hasLocationSet ? 1 : 0.45 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={17} color="#000000" />
                <Text style={styles.saveBtnText}>Save Geofence Settings</Text>
              </>
            )}
          </AnimatedPressable>

          {hasLocationSet && (
            <TouchableOpacity onPress={handleDeleteGeofence} style={styles.removeBtn}>
              <Ionicons name="trash-outline" size={13} color="#ff6961" />
              <Text style={styles.removeBtnText}>Delete Gym Geofence</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.bold,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBlock: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT_FAMILY.regular,
    paddingVertical: 4,
  },
  gpsInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  gpsInlineText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
    color: '#a599ff',
  },
  resultsList: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  resultTitle: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.medium,
  },
  resultAddress: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 1,
  },
  statusCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  statusCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  placeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  placeTitleInput: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.bold,
    paddingVertical: 2,
    paddingHorizontal: 6,
    flex: 1,
    includeFontPadding: false,
  },
  statusHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTrashBtn: {
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#5eda9e',
  },
  activeBadgeText: {
    fontSize: 10,
    color: '#5eda9e',
    fontFamily: FONT_FAMILY.bold,
  },
  addressText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    marginLeft: 22,
    marginTop: 2,
  },
  coordsText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.regular,
    color: '#a599ff',
    marginLeft: 22,
    marginTop: 2,
  },
  radiusRow: {
    flexDirection: 'row',
    gap: 6,
  },
  radiusPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radiusPillText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.medium,
  },
  settingsGroupCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  settingIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  settingTitle: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.bold,
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    lineHeight: 15,
  },
  settingDivider: {
    height: 1,
    marginLeft: 54,
  },
  footerActions: {
    marginTop: 6,
    gap: 6,
  },
  saveBtn: {
    backgroundColor: '#a599ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
  },
  saveBtnText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.bold,
    color: '#000000',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  removeBtnText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
    color: '#ff6961',
  },
});
