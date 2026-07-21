import React, { useRef } from 'react';
import { View, Image, StyleSheet, Dimensions, PanResponder, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

const { width } = Dimensions.get('window');
const SLIDER_WIDTH = width - 40; // Assuming 20px padding on each side
const SLIDER_HEIGHT = 400;

interface Props {
  beforeImage: string;
  afterImage: string;
}

export default function BeforeAfterSlider({ beforeImage, afterImage }: Props) {
  const { colors } = useTheme();
  const pan = useRef(new Animated.Value(SLIDER_WIDTH / 2)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan }], {
        useNativeDriver: false, // width/mask cannot use native driver
      }),
      onPanResponderRelease: (e, gestureState) => {
        // Handle offset logic internally
      },
      onPanResponderGrant: () => {
        pan.setOffset((pan as any)._value);
        pan.setValue(0);
      },
    })
  ).current;

  const boundedPan = pan.interpolate({
    inputRange: [0, SLIDER_WIDTH],
    outputRange: [0, SLIDER_WIDTH],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Background (After Image) */}
      <Image source={{ uri: afterImage }} style={styles.image} resizeMode="cover" />

      {/* Foreground (Before Image) - Masked by width */}
      <Animated.View style={[styles.overlay, { width: boundedPan }]}>
        <Image source={{ uri: beforeImage }} style={styles.image} resizeMode="cover" />
      </Animated.View>

      {/* Draggable handle */}
      <Animated.View
        style={[styles.handleContainer, { transform: [{ translateX: boundedPan }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.handleLine} />
        <View style={styles.handleKnob}>
          <Ionicons name="swap-horizontal" size={20} color="#fff" />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SLIDER_WIDTH,
    height: SLIDER_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#111',
  },
  image: {
    width: SLIDER_WIDTH,
    height: SLIDER_HEIGHT,
    position: 'absolute',
  },
  overlay: {
    position: 'absolute',
    height: SLIDER_HEIGHT,
    overflow: 'hidden',
  },
  handleContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    marginLeft: -20, // Center the handle over the exact pan position
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  handleLine: {
    position: 'absolute',
    width: 2,
    backgroundColor: '#fff',
    top: 0,
    bottom: 0,
  },
  handleKnob: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3BC9DB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
});
