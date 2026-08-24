import React from 'react';
import { StyleSheet, View, Text, Pressable, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { feedback } from '../../utils/haptics';
import { FONT_FAMILY } from '../../theme/tokens';

interface ZenGymAiFabProps {
  onPress: () => void;
  size?: number;
  showBadge?: boolean;
}

export const ZenGymAiFab: React.FC<ZenGymAiFabProps> = ({
  onPress,
  size = 52,
  showBadge = true,
}) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 14, stiffness: 350 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 220 });
  };

  const handlePress = () => {
    feedback.tap();
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.fabContainer, animatedStyle]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.pressable, { width: size, height: size }]}
        android_ripple={null}
        accessibilityRole="button"
        accessibilityLabel="Open ZenGym AI Coach"
      >
        {/* Robot Mascot as Standalone Floating Button (No circular ring) */}
        <Image
          source={require('../../../assets/images/sara-idle.png')}
          style={{
            width: size,
            height: size,
          }}
          resizeMode="contain"
        />

        {/* AI Badge Pill at Top Right */}
        {showBadge && (
          <View style={styles.badgeContainer}>
            <LinearGradient
              colors={['#ec4899', '#8b5cf6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.badgeGradient}
            >
              <Text style={styles.badgeText}>AI</Text>
            </LinearGradient>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 84,
    right: 16,
    zIndex: 9999,
    shadowColor: '#a599ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeContainer: {
    position: 'absolute',
    top: -2,
    right: -4,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#080510',
    overflow: 'hidden',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  badgeGradient: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 8.5,
    color: '#ffffff',
    letterSpacing: 0.5,
    fontWeight: '800',
  },
});

export default ZenGymAiFab;
