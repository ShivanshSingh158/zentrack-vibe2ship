import React, { useRef } from 'react';
import { View, Image, StyleSheet, PanResponder, Animated, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

const SLIDER_HEIGHT = 400;

interface Props {
  beforeImage: string;
  afterImage: string;
}

export default function BeforeAfterSlider({ beforeImage, afterImage }: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const sliderWidth = windowWidth - 40;

  const pan = useRef(new Animated.Value(sliderWidth / 2)).current;
  const currentPosRef = useRef(sliderWidth / 2);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset(currentPosRef.current);
        pan.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        const clampedDx = Math.max(
          -currentPosRef.current,
          Math.min(sliderWidth - currentPosRef.current, gestureState.dx)
        );
        pan.setValue(clampedDx);
      },
      onPanResponderRelease: (_, gestureState) => {
        currentPosRef.current = Math.max(
          0,
          Math.min(sliderWidth, currentPosRef.current + gestureState.dx)
        );
        pan.flattenOffset();
        pan.setValue(currentPosRef.current);
      },
      onPanResponderTerminate: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  const boundedPan = pan.interpolate({
    inputRange: [0, sliderWidth],
    outputRange: [0, sliderWidth],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { width: sliderWidth }]}>
      {/* Background (After Image) */}
      <Image source={{ uri: afterImage }} style={[styles.image, { width: sliderWidth }]} resizeMode="cover" />

      {/* Foreground (Before Image) - Masked by width */}
      <Animated.View style={[styles.overlay, { width: boundedPan }]}>
        <Image source={{ uri: beforeImage }} style={[styles.image, { width: sliderWidth }]} resizeMode="cover" />
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
    height: SLIDER_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#111',
  },
  image: {
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
