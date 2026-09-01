/**
 * locationReminder.types.ts
 * TypeScript interfaces for Location Reminders, Saved Places, and Gym Geofencing.
 */

export type PlaceCategory = 'gym' | 'campus_lab' | 'library' | 'home' | 'work' | 'custom';

export interface SavedPlace {
  id: string;
  name: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  address?: string;
  radius: number; // in meters (e.g. 150)
  createdAt: number;
}

export type GeofenceTriggerType = 'enter' | 'exit';

export interface TaskLocationTrigger {
  placeId?: string;
  placeName: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters (e.g. 150)
  triggerType: GeofenceTriggerType; // 'enter' = on arrival, 'exit' = on departure
  address?: string;
}

export interface GymGeofenceConfig {
  enabled: boolean;
  placeName: string;
  latitude: number;
  longitude: number;
  radius: number; // default 150m
  promptOnEnter: boolean;
  promptOnExit: boolean;
  updatedAt: number;
}
