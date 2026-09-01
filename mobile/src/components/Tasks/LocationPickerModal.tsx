/**
 * LocationPickerModal.tsx — ZenTrack Mobile
 *
 * Luxury obsidian-cosmos bottom sheet for attaching location-based triggers to tasks.
 * Refined glassmorphism aesthetics, compact spatial layout, subtle condition toggles,
 * and seamless 1-tap saved places & current GPS capture.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import BottomSheet from '../ui/BottomSheet';
import AnimatedPressable from '../AnimatedPressable';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY } from '../../theme/tokens';
import {
  getSavedPlaces,
  savePlace,
  deletePlace,
  getCurrentDeviceCoords,
  searchAddressLocations,
  getGymGeofenceConfig,
} from '../../services/savedPlacesService';
import { requestLocationPermissions } from '../../services/geofenceService';
import type { TaskLocationTrigger, GeofenceTriggerType, SavedPlace } from '../../types/locationReminder.types';

interface Props {
  visible: boolean;
  onClose: () => void;
  initialValue?: TaskLocationTrigger | null;
  onSelect: (trigger: TaskLocationTrigger | null) => void;
}

const RADIUS_OPTIONS = [50, 100, 150, 250, 500];

export const LocationPickerModal = React.memo(function LocationPickerModal({
  visible,
  onClose,
  initialValue,
  onSelect,
}: Props) {
  const { colors, isDark } = useTheme();
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [locatingCurrent, setLocatingCurrent] = useState(false);

  // Selected Location State
  const [placeName, setPlaceName] = useState(initialValue?.placeName || '');
  const [address, setAddress] = useState(initialValue?.address || '');
  const [latitude, setLatitude] = useState<number | null>(initialValue?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(initialValue?.longitude ?? null);
  const [radius, setRadius] = useState<number>(initialValue?.radius || 150);
  const [triggerType, setTriggerType] = useState<GeofenceTriggerType>(initialValue?.triggerType || 'enter');

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Load Saved Places & Gym on Open
  useEffect(() => {
    if (!visible) return;

    if (initialValue) {
      setPlaceName(initialValue.placeName || '');
      setAddress(initialValue.address || '');
      setLatitude(initialValue.latitude);
      setLongitude(initialValue.longitude);
      setRadius(initialValue.radius || 150);
      setTriggerType(initialValue.triggerType || 'enter');
    }

    Promise.all([getSavedPlaces(), getGymGeofenceConfig()]).then(([places, gymConfig]) => {
      const list = [...places];
      if (gymConfig && gymConfig.latitude && !list.some(p => p.category === 'gym')) {
        list.unshift({
          id: 'place_gym_auto',
          name: gymConfig.placeName || 'My Gym',
          category: 'gym',
          latitude: gymConfig.latitude,
          longitude: gymConfig.longitude,
          radius: gymConfig.radius || 150,
          createdAt: Date.now(),
        });
      }
      setSavedPlaces(list);
    });
  }, [visible, initialValue]);

  // 1. Select a Saved Place
  const handleSelectSavedPlace = useCallback((place: SavedPlace) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaceName(place.name);
    setAddress(place.address || '');
    setLatitude(place.latitude);
    setLongitude(place.longitude);
    setRadius(place.radius || 150);
    setSearchResults([]);
    setSearchQuery('');
  }, []);

  const handleDeleteSavedPlace = useCallback(async (place: SavedPlace) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Remove Saved Place', `Remove "${place.name}" from your frequent places?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deletePlace(place.id);
          setSavedPlaces(prev => prev.filter(p => p.id !== place.id));
        },
      },
    ]);
  }, []);

  // 1b. Save Current Selection as a Frequent Place
  const [savingPlace, setSavingPlace] = useState(false);
  const handleSaveAsFrequentPlace = useCallback(async () => {
    if (!latitude || !longitude || !placeName.trim()) return;
    setSavingPlace(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const newPlace = await savePlace({
      name: placeName.trim(),
      category: 'custom',
      latitude,
      longitude,
      address,
      radius,
    });

    setSavedPlaces(prev => [newPlace, ...prev.filter(p => p.name !== newPlace.name)]);
    setSavingPlace(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [latitude, longitude, placeName, address, radius]);

  // 2. Use Current Device GPS Spot
  const handleUseCurrentLocation = useCallback(async () => {
    setLocatingCurrent(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      setLocatingCurrent(false);
      Alert.alert(
        'Location Permission Required',
        'Please grant location permissions in Settings to attach location reminders.'
      );
      return;
    }

    const coords = await getCurrentDeviceCoords();
    setLocatingCurrent(false);

    if (coords) {
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
      setAddress(coords.address || '');
      setPlaceName(coords.name || 'Current Location');
      setSearchResults([]);
      setSearchQuery('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Alert.alert('GPS Error', 'Could not get GPS coordinates. Please ensure Location is enabled.');
    }
  }, []);

  // 3. Search Address / Place
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
    setPlaceName(res.name || 'Location');
    setAddress(res.address || '');
    setSearchResults([]);
    setSearchQuery('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // 4. Attach Location Trigger to Task
  const handleConfirm = useCallback(() => {
    if (!latitude || !longitude || !placeName) {
      Alert.alert('Incomplete Location', 'Please select or search a location first.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSelect({
      placeName: placeName.trim(),
      latitude,
      longitude,
      radius,
      triggerType,
      address,
    });
    onClose();
  }, [latitude, longitude, placeName, radius, triggerType, address, onSelect, onClose]);

  const handleRemove = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(null);
    onClose();
  }, [onSelect, onClose]);

  const hasLocation = latitude !== null && longitude !== null;

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
              <Ionicons name="location-sharp" size={16} color="#a599ff" />
            </View>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Location Reminder</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>Notify when you arrive or leave a place</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: isDark ? '#141418' : '#F3F4F6' }]}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* 1-Tap Saved Places Chips */}
        {savedPlaces.length > 0 && (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SAVED PLACES</Text>
              <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Long press to delete</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedPlacesScroll}>
              {savedPlaces.map(place => {
                const isSelected = place.name === placeName && latitude === place.latitude;
                const iconName =
                  place.category === 'gym' ? 'barbell-outline' :
                  place.category === 'campus_lab' ? 'flask-outline' :
                  place.category === 'library' ? 'book-outline' :
                  place.category === 'home' ? 'home-outline' : 'location-outline';

                return (
                  <AnimatedPressable
                    key={place.id}
                    onPress={() => handleSelectSavedPlace(place)}
                    onLongPress={() => handleDeleteSavedPlace(place)}
                    style={[
                      styles.savedPlaceChip,
                      isSelected
                        ? { backgroundColor: 'rgba(165, 153, 255, 0.16)', borderColor: '#a599ff' }
                        : { backgroundColor: isDark ? '#0d0d10' : '#F3F4F6', borderColor: isDark ? '#1c1c20' : '#E5E7EB' },
                    ]}
                  >
                    <Ionicons name={iconName as any} size={13} color={isSelected ? '#a599ff' : colors.textMuted} />
                    <Text
                      style={[
                        styles.savedPlaceText,
                        { color: isSelected ? '#a599ff' : colors.textSecondary, fontWeight: isSelected ? '600' : '400' },
                      ]}
                    >
                      {place.name}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Search Place / Address with inline Current Location Action */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SEARCH PLACE OR GPS</Text>
          <View style={[styles.searchBox, { backgroundColor: isDark ? '#0d0d10' : '#F3F4F6', borderColor: isDark ? '#1c1c20' : '#E5E7EB' }]}>
            <Ionicons name="search" size={15} color={colors.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={handleSearch}
              placeholder="e.g. Campus Lab, Central Library"
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
                  <Ionicons name="location-outline" size={15} color="#a599ff" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>{item.name}</Text>
                    <Text style={[styles.resultAddress, { color: colors.textMuted }]} numberOfLines={1}>{item.address}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Active Selected Location Display Card */}
        {hasLocation && (
          <View style={[styles.selectedCard, { backgroundColor: 'rgba(165, 153, 255, 0.06)', borderColor: 'rgba(165, 153, 255, 0.28)' }]}>
            <View style={styles.selectedCardTop}>
              <View style={styles.selectedTitleRow}>
                <Ionicons name="pin" size={14} color="#a599ff" />
                <TextInput
                  value={placeName}
                  onChangeText={setPlaceName}
                  placeholder="Location Name"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.selectedTitleInput, { color: colors.textPrimary }]}
                />
              </View>
              <TouchableOpacity
                onPress={handleSaveAsFrequentPlace}
                disabled={savingPlace || !placeName.trim()}
                style={[styles.savePlacePill, { backgroundColor: isDark ? '#161424' : '#EDE9FE', borderColor: 'rgba(165, 153, 255, 0.3)' }]}
              >
                <Ionicons name="bookmark-outline" size={11} color="#a599ff" />
                <Text style={styles.savePlacePillText}>{savingPlace ? 'Saving...' : 'Save place'}</Text>
              </TouchableOpacity>
            </View>
            {address ? (
              <Text style={[styles.selectedAddress, { color: colors.textMuted }]} numberOfLines={2}>
                {address}
              </Text>
            ) : null}
          </View>
        )}

        {/* Trigger Condition (Arrival vs Departure) */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>NOTIFY WHEN</Text>
          <View style={styles.triggerRow}>
            <AnimatedPressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTriggerType('enter'); }}
              style={[
                styles.triggerTab,
                triggerType === 'enter'
                  ? { backgroundColor: 'rgba(94, 218, 158, 0.12)', borderColor: '#5eda9e' }
                  : { backgroundColor: isDark ? '#0d0d10' : '#F3F4F6', borderColor: isDark ? '#1c1c20' : '#E5E7EB' },
              ]}
            >
              <Ionicons name="arrow-down-circle" size={15} color={triggerType === 'enter' ? '#5eda9e' : colors.textMuted} />
              <Text style={[styles.triggerText, { color: triggerType === 'enter' ? '#5eda9e' : colors.textMuted }]}>
                Arriving (Enter)
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTriggerType('exit'); }}
              style={[
                styles.triggerTab,
                triggerType === 'exit'
                  ? { backgroundColor: 'rgba(255, 105, 97, 0.12)', borderColor: '#ff6961' }
                  : { backgroundColor: isDark ? '#0d0d10' : '#F3F4F6', borderColor: isDark ? '#1c1c20' : '#E5E7EB' },
              ]}
            >
              <Ionicons name="arrow-up-circle" size={15} color={triggerType === 'exit' ? '#ff6961' : colors.textMuted} />
              <Text style={[styles.triggerText, { color: triggerType === 'exit' ? '#ff6961' : colors.textMuted }]}>
                Leaving (Exit)
              </Text>
            </AnimatedPressable>
          </View>
        </View>

        {/* Radius Selector */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TRIGGER RADIUS</Text>
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
                    {r}m
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>

        {/* Footer Actions */}
        <View style={styles.footerActions}>
          <AnimatedPressable
            onPress={handleConfirm}
            disabled={!hasLocation}
            style={[
              styles.confirmBtn,
              { opacity: hasLocation ? 1 : 0.45 },
            ]}
          >
            <Ionicons name="checkmark-circle" size={17} color="#000000" />
            <Text style={styles.confirmBtnText}>Attach Location Reminder</Text>
          </AnimatedPressable>

          {initialValue && (
            <TouchableOpacity onPress={handleRemove} style={styles.removeBtn}>
              <Ionicons name="trash-outline" size={13} color="#ff6961" />
              <Text style={styles.removeBtnText}>Remove Location Reminder</Text>
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
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.regular,
  },
  savedPlacesScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  savedPlaceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  savedPlaceText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
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
  selectedCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  selectedCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  selectedTitleInput: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.bold,
    paddingVertical: 2,
    paddingHorizontal: 6,
    flex: 1,
    includeFontPadding: false,
  },
  selectedAddress: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 4,
    marginLeft: 20,
  },
  savePlacePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  savePlacePillText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    color: '#a599ff',
  },
  triggerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  triggerTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  triggerText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.bold,
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
  footerActions: {
    marginTop: 10,
    gap: 8,
  },
  confirmBtn: {
    backgroundColor: '#a599ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
  },
  confirmBtnText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.bold,
    color: '#000000',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  removeBtnText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
    color: '#ff6961',
  },
});
