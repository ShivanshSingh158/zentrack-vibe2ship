/**
 * savedPlacesService.ts — ZenTrack Mobile
 *
 * Manages user's saved frequent locations (Gym, Campus Lab, Library, Home, Custom)
 * and provides GPS coordinate capture, smart place name resolution, and address search helpers via expo-location.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import type { SavedPlace, GymGeofenceConfig, PlaceCategory } from '../types/locationReminder.types';

export const SAVED_PLACES_STORAGE_KEY = '@zentrack_saved_places';
export const GYM_GEOFENCE_STORAGE_KEY = '@zentrack_gym_geofence_config';

// ─── Default Preset Places ───────────────────────────────────────────────────
const DEFAULT_PRESET_PLACES: SavedPlace[] = [];

// ─── 1. Saved Places CRUD ────────────────────────────────────────────────────
export async function getSavedPlaces(): Promise<SavedPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_PLACES_STORAGE_KEY);
    if (!raw) return DEFAULT_PRESET_PLACES;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[SavedPlaces] Error reading saved places:', err);
    return DEFAULT_PRESET_PLACES;
  }
}

export async function savePlace(placeData: {
  id?: string;
  name: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  address?: string;
  radius?: number;
}): Promise<SavedPlace> {
  const current = await getSavedPlaces();
  const id = placeData.id || `place_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newPlace: SavedPlace = {
    id,
    name: placeData.name,
    category: placeData.category,
    latitude: placeData.latitude,
    longitude: placeData.longitude,
    address: placeData.address,
    radius: placeData.radius || 150,
    createdAt: Date.now(),
  };

  const updated = current.filter(p => p.id !== id);
  updated.unshift(newPlace);

  await AsyncStorage.setItem(SAVED_PLACES_STORAGE_KEY, JSON.stringify(updated));
  return newPlace;
}

export async function deletePlace(placeId: string): Promise<void> {
  const current = await getSavedPlaces();
  const filtered = current.filter(p => p.id !== placeId);
  await AsyncStorage.setItem(SAVED_PLACES_STORAGE_KEY, JSON.stringify(filtered));
}

// ─── 2. Gym Geofence Config ───────────────────────────────────────────────────
export async function getGymGeofenceConfig(): Promise<GymGeofenceConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(GYM_GEOFENCE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[SavedPlaces] Error reading gym geofence config:', err);
    return null;
  }
}

export async function saveGymGeofenceConfig(config: GymGeofenceConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(GYM_GEOFENCE_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('[SavedPlaces] Error saving gym geofence config:', err);
  }
}

export async function deleteGymGeofenceConfig(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GYM_GEOFENCE_STORAGE_KEY);
    await deletePlace('place_gym_primary');
    await deletePlace('place_gym_auto');
  } catch (err) {
    console.warn('[SavedPlaces] Error deleting gym geofence config:', err);
  }
}

// ─── 3. Helpers: Smart Place Name & Address Formatter ─────────────────────────
function capitalizeWords(str: string): string {
  if (!str) return '';
  return str
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function resolveSmartPlaceName(query: string, r?: Location.LocationGeocodedAddress): string {
  if (!r) return capitalizeWords(query);

  const rawName = (r.name || '').trim();
  // Check if rawName is a plot/house/SCO number (e.g. "205", "1-2", "#45", or very short digits)
  const isNumericOrPlot = !rawName || /^[\d\s\-#/,]+$/.test(rawName) || rawName.length <= 4 || !isNaN(Number(rawName));

  // If reverse geocoding returned an actual POI / place name with letters (e.g. "Punjab Engineering College")
  if (!isNumericOrPlot && rawName.length > 4) {
    return rawName;
  }

  // Otherwise, use the user's searched place name with clean capitalization
  if (query && query.trim().length > 0) {
    return capitalizeWords(query.trim());
  }

  return r.street || r.district || r.city || 'My Gym';
}

function formatFullAddress(r?: Location.LocationGeocodedAddress, fallbackQuery?: string): string {
  if (!r) return fallbackQuery || '';

  const rawName = (r.name || '').trim();
  const isPlotOrNumber = /^[\d\s\-#/,]+$/.test(rawName) && rawName.length <= 6;

  const parts: string[] = [];
  if (isPlotOrNumber && rawName) {
    parts.push(`Plot/SCO ${rawName}`);
  }
  if (r.street) parts.push(r.street);
  if (r.district && r.district !== r.street) parts.push(r.district);
  if (r.city && r.city !== r.district) parts.push(r.city);
  if (r.region && r.region !== r.city) parts.push(r.region);

  return parts.length > 0 ? parts.join(', ') : (fallbackQuery || '');
}

// ─── 4. GPS & Geocoding Helpers ───────────────────────────────────────────────
export async function getCurrentDeviceCoords(): Promise<{
  name?: string;
  latitude: number;
  longitude: number;
  address?: string;
} | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude } = loc.coords;
    let name: string | undefined;
    let address: string | undefined;

    try {
      const reverse = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (reverse && reverse.length > 0) {
        const item = reverse[0];
        name = resolveSmartPlaceName('Current Location', item);
        address = formatFullAddress(item);
      }
    } catch {
      // Reverse geocode failed non-critically
    }

    return { name, latitude, longitude, address };
  } catch (err: any) {
    console.warn('[SavedPlaces] getCurrentDeviceCoords failed:', err?.message);
    return null;
  }
}

export async function searchAddressLocations(query: string): Promise<
  Array<{
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  }>
> {
  if (!query || query.trim().length < 2) return [];

  try {
    // 1. Query device geocoding engine for coordinates
    const results = await Location.geocodeAsync(query.trim());
    if (!results || results.length === 0) return [];

    // 2. Reverse geocode the coordinates to extract the TRUE landmark/POI name & address
    const parsed = await Promise.all(
      results.slice(0, 5).map(async res => {
        let placeName = capitalizeWords(query.trim());
        let formattedAddress = query.trim();

        try {
          const rev = await Location.reverseGeocodeAsync({
            latitude: res.latitude,
            longitude: res.longitude,
          });

          if (rev && rev.length > 0) {
            const r = rev[0];
            placeName = resolveSmartPlaceName(query.trim(), r);
            formattedAddress = formatFullAddress(r, query.trim());
          }
        } catch {
          // fallback to query
        }

        return {
          name: placeName,
          address: formattedAddress,
          latitude: res.latitude,
          longitude: res.longitude,
        };
      })
    );

    return parsed;
  } catch (err: any) {
    console.warn('[SavedPlaces] searchAddressLocations failed:', err?.message);
    return [];
  }
}
