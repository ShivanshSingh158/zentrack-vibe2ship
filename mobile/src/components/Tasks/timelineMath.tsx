import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Line, Rect } from 'react-native-svg';

export interface ClassBlock {
  id: string;
  title: string;
  type: 'class' | 'lab' | 'gym';
  startFloat: number;
  endFloat: number;
  top: number;
  height: number;
  time: string;
  room?: string;
  logStatus: 'attended' | 'missed' | 'cancelled' | 'unlogged';
  isOngoing?: boolean;
}

export const DEFAULT_START_HOUR = 6;
export const END_HOUR = 23;
export const HOUR_HEIGHT = 80;
export const SNAP_MINUTES = 15; // 15-minute grid
export const PIXELS_PER_MINUTE = HOUR_HEIGHT / 60;
export const SNAP_PX = SNAP_MINUTES * PIXELS_PER_MINUTE; // 20px per 15 min

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** SVG diagonal stripes drawn over completed/attended blocks */
export function HatchOverlay({
  width,
  height,
  color = 'rgba(255,255,255,0.12)',
  id = 'hatch'
}: {
  width: number;
  height: number;
  color?: string;
  id?: string;
}) {
  const patternId = `hatch-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Defs>
        <Pattern id={patternId} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={8} stroke={color} strokeWidth={2.5} />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${patternId})`} />
    </Svg>
  );
}

export function parseTime(timeStr: string | undefined): number | null {
  if (!timeStr) return null;
  const upper = timeStr.trim().toUpperCase();
  const isPM = upper.includes('PM');
  const isAM = upper.includes('AM');
  const cleaned = upper.replace(/[APM\s]+$/i, '').trim();
  const parts = cleaned.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return null;
  const m = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
  if (isPM || isAM) {
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
  }
  return Math.max(0, Math.min(24, h + m / 60));
}

export function floatToTimeString(floatHour: number): string {
  const totalMinutes = Math.round(floatHour * 60);
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function parseTimeRange(raw: string, defaultDurationHours: number = 1): { startFloat: number | null; endFloat: number | null } {
  if (!raw) return { startFloat: null, endFloat: null };
  const parts = raw.split(/[-–—•]| to /i);
  const startFloat = parseTime(parts[0]?.trim());
  if (startFloat === null) return { startFloat: null, endFloat: null };
  let endFloat: number | null = null;
  if (parts.length > 1 && parts[1]?.trim()) {
    endFloat = parseTime(parts[1].trim());
  }
  if (endFloat === null || endFloat <= startFloat) {
    endFloat = Math.min(END_HOUR, startFloat + defaultDurationHours);
  }
  return { startFloat, endFloat };
}

export function snapTopToGrid(top: number): number {
  'worklet';
  return Math.round(top / SNAP_PX) * SNAP_PX;
}

export function topToTimeSlot(snappedTop: number, startHour: number, durationFloat: number): string {
  const startFloat = startHour + snappedTop / HOUR_HEIGHT;
  const endFloat = startFloat + durationFloat;
  return `${floatToTimeString(startFloat)} - ${floatToTimeString(endFloat)}`;
}

export function getTaskBlockColors(priority: string, isDone: boolean, isMissed: boolean, isDark: boolean) {
  const isHigh = priority === 'high' || priority === 'P1';
  const isMed = priority === 'medium' || priority === 'P2';

  if (isDone) {
    return {
      accentColor: isDark ? '#5EDA9E' : '#059669',
      bgColor: isDark ? 'rgba(94, 218, 158, 0.14)' : 'rgba(16, 185, 129, 0.12)',
      borderNormal: isDark ? 'rgba(94, 218, 158, 0.45)' : 'rgba(5, 150, 105, 0.35)',
      hatchColor: isDark ? 'rgba(94, 218, 158, 0.10)' : 'rgba(5, 150, 105, 0.08)',
      badgeBg: isDark ? 'rgba(94, 218, 158, 0.18)' : 'rgba(16, 185, 129, 0.15)',
      badgeText: isDark ? '#5EDA9E' : '#059669',
    };
  }

  if (isMissed) {
    return {
      accentColor: isDark ? '#FF6961' : '#DC2626',
      bgColor: isDark ? 'rgba(255, 105, 97, 0.14)' : 'rgba(239, 68, 68, 0.10)',
      borderNormal: isDark ? 'rgba(255, 105, 97, 0.45)' : 'rgba(220, 38, 38, 0.35)',
      hatchColor: isDark ? 'rgba(255, 105, 97, 0.10)' : 'rgba(220, 38, 38, 0.08)',
      badgeBg: isDark ? 'rgba(255, 105, 97, 0.18)' : 'rgba(239, 68, 68, 0.15)',
      badgeText: isDark ? '#FF6961' : '#DC2626',
    };
  }

  if (isHigh) {
    return {
      accentColor: isDark ? '#FF6961' : '#DC2626',
      bgColor: isDark ? 'rgba(255, 105, 97, 0.16)' : 'rgba(239, 68, 68, 0.12)',
      borderNormal: isDark ? 'rgba(255, 105, 97, 0.45)' : 'rgba(220, 38, 38, 0.35)',
      hatchColor: 'transparent',
      badgeBg: 'transparent',
      badgeText: isDark ? '#FF6961' : '#DC2626',
    };
  }

  if (isMed) {
    return {
      accentColor: isDark ? '#FF9F4D' : '#D97706',
      bgColor: isDark ? 'rgba(255, 159, 77, 0.16)' : 'rgba(245, 158, 11, 0.12)',
      borderNormal: isDark ? 'rgba(255, 159, 77, 0.45)' : 'rgba(217, 119, 6, 0.35)',
      hatchColor: 'transparent',
      badgeBg: 'transparent',
      badgeText: isDark ? '#FF9F4D' : '#D97706',
    };
  }

  // Low / Default (Signature Purple)
  return {
    accentColor: isDark ? '#A599FF' : '#6C5CE7',
    bgColor: isDark ? 'rgba(165, 153, 255, 0.14)' : 'rgba(108, 92, 231, 0.12)',
    borderNormal: isDark ? 'rgba(165, 153, 255, 0.40)' : 'rgba(108, 92, 231, 0.35)',
    hatchColor: 'transparent',
    badgeBg: 'transparent',
    badgeText: isDark ? '#A599FF' : '#6C5CE7',
  };
}

export function getStaticBlockColors(
  type: 'class' | 'lab' | 'gym',
  logStatus: 'attended' | 'missed' | 'cancelled' | 'unlogged',
  isOngoing: boolean,
  isPast: boolean,
  isDark: boolean
) {
  if (logStatus === 'attended') {
    return {
      accentColor: isDark ? '#5EDA9E' : '#059669',
      bgColor: isDark ? 'rgba(94, 218, 158, 0.12)' : 'rgba(16, 185, 129, 0.10)',
      borderColor: isDark ? 'rgba(94, 218, 158, 0.35)' : 'rgba(5, 150, 105, 0.30)',
      tagColor: isDark ? '#5EDA9E' : '#059669',
      hatchColor: isDark ? 'rgba(94, 218, 158, 0.08)' : 'rgba(5, 150, 105, 0.06)',
      iconName: type === 'gym' ? 'barbell-outline' : type === 'lab' ? 'flask-outline' : 'book-outline',
      badgeText: 'PRESENT',
      isLineThrough: true,
    };
  }

  if (logStatus === 'missed') {
    return {
      accentColor: isDark ? '#FF6961' : '#DC2626',
      bgColor: isDark ? 'rgba(255, 105, 97, 0.12)' : 'rgba(239, 68, 68, 0.10)',
      borderColor: isDark ? 'rgba(255, 105, 97, 0.35)' : 'rgba(220, 38, 38, 0.30)',
      tagColor: isDark ? '#FF6961' : '#DC2626',
      hatchColor: isDark ? 'rgba(255, 105, 97, 0.08)' : 'rgba(220, 38, 38, 0.06)',
      iconName: type === 'gym' ? 'barbell-outline' : type === 'lab' ? 'flask-outline' : 'book-outline',
      badgeText: 'ABSENT',
      isLineThrough: true,
    };
  }

  if (logStatus === 'cancelled') {
    return {
      accentColor: isDark ? '#8E8E93' : '#6B7280',
      bgColor: isDark ? 'rgba(100, 100, 100, 0.10)' : 'rgba(0, 0, 0, 0.04)',
      borderColor: isDark ? 'rgba(160, 160, 160, 0.30)' : 'rgba(0, 0, 0, 0.10)',
      tagColor: isDark ? '#8E8E93' : '#6B7280',
      hatchColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      iconName: 'close-circle-outline',
      badgeText: 'CANCELLED',
      isLineThrough: true,
    };
  }

  // Unlogged / Pending
  if (isOngoing) {
    return {
      accentColor: isDark ? '#A599FF' : '#6C5CE7',
      bgColor: isDark ? 'rgba(165, 153, 255, 0.16)' : 'rgba(108, 92, 231, 0.12)',
      borderColor: isDark ? 'rgba(165, 153, 255, 0.50)' : 'rgba(108, 92, 231, 0.40)',
      tagColor: isDark ? '#A599FF' : '#6C5CE7',
      hatchColor: 'transparent',
      iconName: type === 'gym' ? 'barbell-outline' : type === 'lab' ? 'flask-outline' : 'book-outline',
      badgeText: 'IN PROGRESS',
      isLineThrough: false,
    };
  }

  if (isPast) {
    return {
      accentColor: isDark ? '#8E8E93' : '#9CA3AF',
      bgColor: isDark ? 'rgba(100, 100, 100, 0.08)' : 'rgba(0, 0, 0, 0.03)',
      borderColor: isDark ? 'rgba(160, 160, 160, 0.25)' : 'rgba(0, 0, 0, 0.08)',
      tagColor: isDark ? '#8E8E93' : '#6B7280',
      hatchColor: 'transparent',
      iconName: type === 'gym' ? 'barbell-outline' : type === 'lab' ? 'flask-outline' : 'book-outline',
      badgeText: type === 'gym' ? 'GYM' : type === 'lab' ? 'LAB' : 'CLASS',
      isLineThrough: false,
    };
  }

  if (type === 'gym') {
    return {
      accentColor: isDark ? '#5EDA9E' : '#059669',
      bgColor: isDark ? 'rgba(94, 218, 158, 0.14)' : 'rgba(16, 185, 129, 0.12)',
      borderColor: isDark ? 'rgba(94, 218, 158, 0.45)' : 'rgba(5, 150, 105, 0.35)',
      tagColor: isDark ? '#5EDA9E' : '#059669',
      hatchColor: 'transparent',
      iconName: 'barbell-outline',
      badgeText: 'GYM',
      isLineThrough: false,
    };
  }

  if (type === 'lab') {
    return {
      accentColor: isDark ? '#FAD7A1' : '#0284C7',
      bgColor: isDark ? 'rgba(250, 215, 161, 0.14)' : 'rgba(2, 132, 199, 0.12)',
      borderColor: isDark ? 'rgba(250, 215, 161, 0.45)' : 'rgba(2, 132, 199, 0.35)',
      tagColor: isDark ? '#FAD7A1' : '#0284C7',
      hatchColor: 'transparent',
      iconName: 'flask-outline',
      badgeText: 'LAB',
      isLineThrough: false,
    };
  }

  // Class
  return {
    accentColor: isDark ? '#89DCEB' : '#6C5CE7',
    bgColor: isDark ? 'rgba(137, 220, 235, 0.14)' : 'rgba(108, 92, 231, 0.12)',
    borderColor: isDark ? 'rgba(137, 220, 235, 0.45)' : 'rgba(108, 92, 231, 0.35)',
    tagColor: isDark ? '#89DCEB' : '#6C5CE7',
    hatchColor: 'transparent',
    iconName: 'book-outline',
    badgeText: 'CLASS',
    isLineThrough: false,
  };
}
