/**
 * savedPlacesService.ts — ZenTrack Mobile
 *
 * Manages user's saved frequent locations (Gym, Campus Lab, Library, Home, Custom)
 * and provides GPS coordinate capture, smart place name resolution, raw coordinate parsing,
 * and address search helpers via expo-location.
 *
 * FULL CLOUD PERSISTENCE:
 * All saved places and gym geofence configurations are synced to Firestore (`user_profiles/{uid}`)
 * so they survive app reinstalls and device changes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import type { SavedPlace, GymGeofenceConfig, PlaceCategory } from '../types/locationReminder.types';
import { db, auth } from './firebase';
import { COLLECTION } from '../config/constants';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { safeWrite } from '../utils/safeWrite';

export const SAVED_PLACES_STORAGE_KEY = '@zentrack_saved_places';
export const GYM_GEOFENCE_STORAGE_KEY = '@zentrack_gym_geofence_config';

// ─── Default Preset Places ───────────────────────────────────────────────────
const DEFAULT_PRESET_PLACES: SavedPlace[] = [];

// ─── 1. Saved Places CRUD ────────────────────────────────────────────────────
export async function getSavedPlaces(): Promise<SavedPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_PLACES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }

    // Cloud Fallback: If local storage is empty, hydrate from Firestore
    const user = auth.currentUser;
    if (user?.uid) {
      try {
        const snap = await getDoc(doc(db, COLLECTION.USER_PROFILES, user.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data?.savedPlaces) && data.savedPlaces.length > 0) {
            await AsyncStorage.setItem(SAVED_PLACES_STORAGE_KEY, JSON.stringify(data.savedPlaces));
            return data.savedPlaces;
          }
        }
      } catch (cloudErr) {
        console.warn('[SavedPlaces] Cloud fetch fallback error:', cloudErr);
      }
    }

    return DEFAULT_PRESET_PLACES;
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

  // 1. Instant local persistence
  await AsyncStorage.setItem(SAVED_PLACES_STORAGE_KEY, JSON.stringify(updated));

  // 2. Cloud sync to Firestore user profile
  const user = auth.currentUser;
  if (user?.uid) {
    safeWrite(
      () => setDoc(doc(db, COLLECTION.USER_PROFILES, user.uid), { savedPlaces: updated, updatedAt: Date.now() }, { merge: true }),
      COLLECTION.USER_PROFILES,
      'update',
      { savedPlaces: updated },
      user.uid
    ).catch(() => {});
  }

  return newPlace;
}

export async function deletePlace(placeId: string): Promise<void> {
  const current = await getSavedPlaces();
  const filtered = current.filter(p => p.id !== placeId);

  // 1. Instant local persistence
  await AsyncStorage.setItem(SAVED_PLACES_STORAGE_KEY, JSON.stringify(filtered));

  // 2. Cloud sync to Firestore user profile
  const user = auth.currentUser;
  if (user?.uid) {
    safeWrite(
      () => setDoc(doc(db, COLLECTION.USER_PROFILES, user.uid), { savedPlaces: filtered, updatedAt: Date.now() }, { merge: true }),
      COLLECTION.USER_PROFILES,
      'update',
      { savedPlaces: filtered },
      user.uid
    ).catch(() => {});
  }
}

// ─── 2. Gym Geofence Config ───────────────────────────────────────────────────
export async function getGymGeofenceConfig(): Promise<GymGeofenceConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(GYM_GEOFENCE_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }

    // Cloud Fallback: If local storage is empty, check Firestore
    const user = auth.currentUser;
    if (user?.uid) {
      try {
        const snap = await getDoc(doc(db, COLLECTION.USER_PROFILES, user.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (data?.gymGeofenceConfig) {
            await AsyncStorage.setItem(GYM_GEOFENCE_STORAGE_KEY, JSON.stringify(data.gymGeofenceConfig));
            return data.gymGeofenceConfig;
          }
        }
      } catch (cloudErr) {
        console.warn('[SavedPlaces] Cloud gym config fetch error:', cloudErr);
      }
    }

    return null;
  } catch (err) {
    console.warn('[SavedPlaces] Error reading gym geofence config:', err);
    return null;
  }
}

export async function saveGymGeofenceConfig(config: GymGeofenceConfig): Promise<void> {
  try {
    // 1. Instant local persistence
    await AsyncStorage.setItem(GYM_GEOFENCE_STORAGE_KEY, JSON.stringify(config));

    // 2. Cloud sync to Firestore user profile
    const user = auth.currentUser;
    if (user?.uid) {
      safeWrite(
        () => setDoc(doc(db, COLLECTION.USER_PROFILES, user.uid), { gymGeofenceConfig: config, updatedAt: Date.now() }, { merge: true }),
        COLLECTION.USER_PROFILES,
        'update',
        { gymGeofenceConfig: config },
        user.uid
      ).catch(() => {});
    }
  } catch (err) {
    console.warn('[SavedPlaces] Error saving gym geofence config:', err);
  }
}

export async function deleteGymGeofenceConfig(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GYM_GEOFENCE_STORAGE_KEY);
    await deletePlace('place_gym_primary');
    await deletePlace('place_gym_auto');

    const user = auth.currentUser;
    if (user?.uid) {
      safeWrite(
        () => setDoc(doc(db, COLLECTION.USER_PROFILES, user.uid), { gymGeofenceConfig: null, updatedAt: Date.now() }, { merge: true }),
        COLLECTION.USER_PROFILES,
        'update',
        { gymGeofenceConfig: null },
        user.uid
      ).catch(() => {});
    }
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
  const isNumericOrPlot = !rawName || /^[\d\s\-#/,]+$/.test(rawName) || rawName.length <= 4 || !isNaN(Number(rawName));

  if (!isNumericOrPlot && rawName.length > 4) {
    return rawName;
  }

  if (query && query.trim().length > 0 && !parseCoordinates(query)) {
    return capitalizeWords(query.trim());
  }

  return r.street || r.district || r.city || 'Saved Location';
}

function formatFullAddress(r?: Location.LocationGeocodedAddress, fallbackQuery?: string): string {
  if (!r) return fallbackQuery || '';

  const rawName = (r.name || '').trim();
  const isPlotOrNumber = /^[\d\s\-#/,]+$/.test(rawName) && rawName.length <= 6;

  const parts: string[] = [];
  if (rawName && !isPlotOrNumber) {
    parts.push(rawName);
  } else if (rawName && isPlotOrNumber) {
    parts.push(`#${rawName}`);
  }
  if (r.street && r.street !== rawName) parts.push(r.street);
  if (r.district && r.district !== r.street) parts.push(r.district);
  if (r.city && r.city !== r.district) parts.push(r.city);
  if (r.region && r.region !== r.city) parts.push(r.region);

  return parts.length > 0 ? parts.join(', ') : (fallbackQuery || '');
}

// ─── 4. Coordinate Parser Helper ──────────────────────────────────────────────
/**
 * Parses raw GPS coordinate queries like:
 * - "30.7654, 76.7865"
 * - "30.7654 76.7865"
 * - "lat: 30.7654, lng: 76.7865"
 * - "28.6139° N, 77.2090° E"
 * - "-33.8688, 151.2093"
 */
export function parseCoordinates(query: string): { latitude: number; longitude: number } | null {
  if (!query || typeof query !== 'string') return null;

  const clean = query
    .trim()
    .replace(/[°'"]/g, '')
    .replace(/\b(?:lat|latitude)\s*[:=]?\s*/gi, '')
    .replace(/\b(?:lng|long|longitude)\s*[:=]?\s*/gi, ',')
    .replace(/[Nn]/g, '')
    .replace(/[Ss]/g, '-')
    .replace(/[Ee]/g, '')
    .replace(/[Ww]/g, '-');

  // Match: (sign)(digits)(optional decimal) followed by comma/space/slash followed by (sign)(digits)(optional decimal)
  const match = clean.match(/^([+-]?\d+(?:\.\d+)?)[,\s/|;]+([+-]?\d+(?:\.\d+)?)$/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }
  return null;
}

// ─── 5. GPS & Geocoding Helpers ───────────────────────────────────────────────
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
    isCoordinates?: boolean;
  }>
> {
  if (!query || query.trim().length < 2) return [];

  const rawQuery = query.trim();

  // ── A. DIRECT GPS COORDINATES INPUT ─────────────────────────────────────────
  // Check if query is raw coordinates (e.g. "30.7654, 76.7865")
  const coordsMatch = parseCoordinates(rawQuery);
  if (coordsMatch) {
    const { latitude, longitude } = coordsMatch;
    let placeName = `GPS Pin (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
    let formattedAddress = `Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

    try {
      const rev = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (rev && rev.length > 0) {
        const item = rev[0];
        const smartName = resolveSmartPlaceName(rawQuery, item);
        if (smartName && smartName !== 'Saved Location') {
          placeName = smartName;
        }
        const fullAddr = formatFullAddress(item);
        if (fullAddr) {
          formattedAddress = `${fullAddr} (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
        }
      }
    } catch {
      // Offline / remote location reverse geocode fallback
    }

    return [
      {
        name: placeName,
        address: formattedAddress,
        latitude,
        longitude,
        isCoordinates: true,
      },
    ];
  }

  // ── B. TEXT SEARCH ADDRESS / PLACE ──────────────────────────────────────────
  try {
    // 1. Query device geocoding engine for coordinates
    const results = await Location.geocodeAsync(rawQuery);
    if (!results || results.length === 0) return [];

    // 2. Reverse geocode the coordinates to extract the TRUE landmark/POI name & address
    const parsed = await Promise.all(
      results.slice(0, 5).map(async res => {
        let placeName = capitalizeWords(rawQuery);
        let formattedAddress = rawQuery;

        try {
          const rev = await Location.reverseGeocodeAsync({
            latitude: res.latitude,
            longitude: res.longitude,
          });

          if (rev && rev.length > 0) {
            const r = rev[0];
            placeName = resolveSmartPlaceName(rawQuery, r);
            formattedAddress = formatFullAddress(r, rawQuery);
          }
        } catch {
          // fallback to query
        }

        return {
          name: placeName,
          address: formattedAddress,
          latitude: res.latitude,
          longitude: res.longitude,
          isCoordinates: false,
        };
      })
    );

    return parsed;
  } catch (err: any) {
    console.warn('[SavedPlaces] searchAddressLocations failed:', err?.message);
    return [];
  }
}

