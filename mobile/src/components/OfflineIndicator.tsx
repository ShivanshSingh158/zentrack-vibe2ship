import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, SHADOW } from '../theme/tokens';
import { useTheme } from "../contexts/ThemeContext";

export function OfflineIndicator() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const [isOffline, setIsOffline] = useState(false);
  const translateY = useSharedValue(-100);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = state.isConnected === false;
      setIsOffline(offline);
      translateY.value = withSpring(offline ? Math.max(insets.top, 10) + 10 : -100);
    });

    return () => unsubscribe();
  }, [translateY, insets.top]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }]
  }));

  return (
    <Animated.View 
      style={[
        styles.container, 
        animatedStyle
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

const makeStyles = (colors: any) => StyleSheet.create({
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
