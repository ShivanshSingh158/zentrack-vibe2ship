/**
 * UserAvatar.tsx — ZenTrack Mobile
 *
 * Self-healing, high-performance user profile avatar component:
 * - Prioritizes permanent local on-device disk cache (file://) for 0ms Frame 0 paint.
 * - Auto-caches remote Google/Gmail photoURL to disk via userAvatarService.
 * - Graceful letter fallback with theme styling if image is unavailable.
 * - Eliminates intermittent loading failure across app launches & offline states.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle, ImageStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY } from '../../theme/tokens';
import {
  getLocalAvatarUriSync,
  getCachedAvatarUri,
  cacheUserAvatar,
  subscribeAvatarChanges,
} from '../../services/userAvatarService';

export interface UserAvatarProps {
  size?: number;
  uid?: string | null;
  photoURL?: string | null;
  fallbackLetter?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  textStyle?: StyleProp<TextStyle>;
  showOnlineRing?: boolean;
  accessibilityLabel?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = React.memo(({
  size = 32,
  uid,
  photoURL,
  fallbackLetter = 'A',
  style,
  imageStyle,
  textStyle,
  showOnlineRing = false,
  accessibilityLabel = 'User Profile Avatar',
}) => {
  const { colors, isDark } = useTheme();

  // 1. Synchronous disk cache lookup for 0ms Frame 0 paint
  const [localUri, setLocalUri] = useState<string | null>(() => getLocalAvatarUriSync(uid));
  const [loadError, setLoadError] = useState(false);

  // 2. Resolve cached file and ensure remote photo is saved to disk
  useEffect(() => {
    if (!uid) return;

    let isMounted = true;

    // Check disk storage for previously cached file
    getCachedAvatarUri(uid).then(cached => {
      if (isMounted && cached) {
        setLocalUri(cached);
        setLoadError(false);
      }
    });

    // Listen for cache updates (e.g. background download completion)
    const unsubscribe = subscribeAvatarChanges((updatedUid, newUri) => {
      if (isMounted && updatedUid === uid) {
        setLocalUri(newUri);
        setLoadError(false);
      }
    });

    // Proactively download & cache remote photo to disk in background
    if (photoURL) {
      cacheUserAvatar(uid, photoURL).catch(() => {});
    }

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [uid, photoURL]);

  // Reset load error when photoURL or localUri changes
  useEffect(() => {
    setLoadError(false);
  }, [photoURL, localUri]);

  // Determine active URI: local on-device disk file takes highest priority
  const activeUri = localUri || (photoURL && !loadError ? photoURL : null);

  const borderRadius = Math.round(size / 2);
  const fontSize = Math.max(11, Math.round(size * 0.40));
  const onlineRingSize = Math.max(10, Math.round(size * 0.22));
  const onlineRingBorder = Math.max(1.5, Math.round(size * 0.035));

  const containerStyle = useMemo(() => ([
    styles.container,
    {
      width: size,
      height: size,
      borderRadius,
      backgroundColor: isDark ? '#2c2c2e' : '#e5e5ea',
    },
    style,
  ]), [size, borderRadius, isDark, style]);

  const letterStyle = useMemo(() => ([
    styles.letter,
    {
      fontSize,
      color: colors.textPrimary,
    },
    textStyle,
  ]), [fontSize, colors.textPrimary, textStyle]);

  return (
    <View style={containerStyle} accessibilityLabel={accessibilityLabel} accessibilityRole="image">
      {activeUri && !loadError ? (
        <ExpoImage
          source={{ uri: activeUri }}
          style={[
            {
              width: size,
              height: size,
              borderRadius,
            },
            imageStyle,
          ]}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          onError={() => {
            // If localUri fails, fallback to photoURL; if both fail, show fallback letter
            if (localUri) {
              setLocalUri(null);
            } else {
              setLoadError(true);
            }
          }}
        />
      ) : (
        <Text style={letterStyle}>{fallbackLetter || 'A'}</Text>
      )}

      {showOnlineRing && (
        <View
          style={[
            styles.onlineRing,
            {
              width: onlineRingSize,
              height: onlineRingSize,
              borderRadius: onlineRingSize / 2,
              borderWidth: onlineRingBorder,
              borderColor: isDark ? '#1c1c1e' : '#ffffff',
            },
          ]}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  letter: {
    fontFamily: FONT_FAMILY.bold,
    includeFontPadding: false,
    textAlign: 'center',
  },
  onlineRing: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#34c759',
  },
});

export default UserAvatar;
