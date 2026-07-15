import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, FONT_SIZE, SHADOW } from '../theme/tokens';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const translateY = React.useRef(new Animated.Value(-100)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      // In iOS simulator this can initially be null, so check explicitly for false
      const offline = state.isConnected === false;
      setIsOffline(offline);
      
      Animated.spring(translateY, {
        toValue: offline ? 0 : -100,
        useNativeDriver: true,
        bounciness: 0,
        speed: 12
      }).start();
    });

    return () => unsubscribe();
  }, [translateY]);

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          transform: [{ translateY }], 
          top: Math.max(insets.top, 10) + 10 
        }
      ]}
      pointerEvents="none"
    >
      <View style={styles.banner}>
        <Ionicons name="cloud-offline" size={16} color="#000" />
        <Text style={styles.text}>Offline mode — logs saved locally</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  banner: {
    backgroundColor: '#FDE293', // Warning yellow
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    ...SHADOW.md,
  },
  text: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: '#000',
  }
});
