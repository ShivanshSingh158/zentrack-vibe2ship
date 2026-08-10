/**
 * IOSScrollView — ZenTrack Mobile
 *
 * A drop-in ScrollView/FlatList wrapper that replicates iOS scroll physics on Android.
 * Use this everywhere instead of raw ScrollView for a consistent premium feel.
 *
 * What it does:
 *  - overScrollMode="never"      → No Android "glow" at scroll edges (iOS has none)
 *  - decelerationRate="normal"   → iOS-like momentum deceleration (Android default is "fast" which feels abrupt)
 *  - showsVerticalScrollIndicator={false} → Cleaner look (iOS hides them by default in most apps)
 *  - keyboardShouldPersistTaps="handled" → Tapping a button dismisses keyboard without eating the tap (iOS default behavior)
 */
import React from 'react';
import { ScrollView, ScrollViewProps, FlatList, FlatListProps } from 'react-native';

// ─── iOS-like ScrollView ──────────────────────────────────────────────────────
export function IOSScrollView({ children, ...props }: ScrollViewProps) {
  return (
    <ScrollView
      overScrollMode="never"
      decelerationRate="normal"
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      {...props}
    >
      {children}
    </ScrollView>
  );
}

// ─── iOS-like FlatList ────────────────────────────────────────────────────────
export function IOSFlatList<T>(props: FlatListProps<T>) {
  return (
    <FlatList
      overScrollMode="never"
      decelerationRate="normal"
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      {...props}
    />
  );
}
